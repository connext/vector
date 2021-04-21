import {
  ChannelUpdate,
  UpdateType,
  IMessagingService,
  FullChannelState,
  IChannelSigner,
  Result,
  UpdateParams,
  Values,
  IVectorChainReader,
  FullTransferState,
  IExternalValidation,
  MessagingError,
  jsonifyError,
} from "@connext/vector-types";
import { getRandomBytes32 } from "@connext/vector-utils";
import pino from "pino";

import { QueuedUpdateError } from "./errors";
import { validateChannelSignatures } from "./utils";
import { validateAndApplyInboundUpdate, validateParamsAndApplyUpdate } from "./validate";

// Function responsible for handling user-initated/outbound channel updates.
// These updates will be single signed, the function should dispatch the
// message to the counterparty, and resolve once the updated channel state
// has been received. Will be persisted within the queue to avoid race
// conditions around a double signed update being received but *not* yet
// saved before being cancelled
type UpdateResult = {
  updatedChannel: FullChannelState;
  updatedTransfers?: FullTransferState[];
  updatedTransfer?: FullTransferState;
};

export type SelfUpdateResult = UpdateResult & {
  successfullyApplied: boolean;
};

export async function outbound(
  params: UpdateParams<any>,
  activeTransfers: FullTransferState[],
  previousState: FullChannelState | undefined,
  chainReader: IVectorChainReader,
  messagingService: IMessagingService,
  externalValidationService: IExternalValidation,
  signer: IChannelSigner,
  logger: pino.BaseLogger,
): Promise<Result<SelfUpdateResult, QueuedUpdateError>> {
  const method = "outbound";
  const methodId = getRandomBytes32();
  logger.debug({ method, methodId }, "Method start");

  // Ensure parameters are valid, and action can be taken
  const updateRes = await validateParamsAndApplyUpdate(
    signer,
    chainReader,
    externalValidationService,
    params,
    previousState,
    activeTransfers,
    signer.publicIdentifier,
    logger,
  );
  if (updateRes.isError) {
    logger.warn({ method, methodId, error: jsonifyError(updateRes.getError()!) }, "Failed to apply proposed update");
    return Result.fail(updateRes.getError()!);
  }

  // Get all the properly updated values
  let { update, updatedChannel, updatedTransfer, updatedActiveTransfers } = updateRes.getValue();
  logger.debug(
    {
      method,
      channel: updatedChannel.channelAddress,
      transfer: updatedTransfer?.transferId,
      type: params.type,
    },
    "Generated update",
  );

  // Send and wait for response
  logger.debug({ method, methodId, to: update.toIdentifier, type: update.type }, "Sending protocol message");
  let counterpartyResult = await messagingService.sendProtocolMessage(
    update,
    previousState?.latestUpdate,
    // LOCK_TTL / 10,
    // 5,
  );

  // IFF the result failed because the update is stale, our channel is behind
  // so we should try to sync the channel and resend the update
  let error = counterpartyResult.getError();
  if (error && error.message !== QueuedUpdateError.reasons.StaleUpdate) {
    // Error is something other than sync, fail
    logger.error({ method, methodId, error: jsonifyError(error) }, "Error receiving response, will not save state!");
    return Result.fail(
      new QueuedUpdateError(
        error.message === MessagingError.reasons.Timeout
          ? QueuedUpdateError.reasons.CounterpartyOffline
          : QueuedUpdateError.reasons.CounterpartyFailure,
        params,
        previousState,
        {
          counterpartyError: jsonifyError(error),
        },
      ),
    );
  }
  if (error && error.message === QueuedUpdateError.reasons.StaleUpdate) {
    // Handle sync error, then return failure
    logger.warn(
      {
        method,
        methodId,
        proposed: update.nonce,
        error: jsonifyError(error),
      },
      `Behind, syncing then cancelling proposed`,
    );

    // Get the synced state and new update
    const syncedResult = await syncState(
      error.context.update,
      previousState!, // safe to do bc will fail if syncing setup (only time state is undefined)
      activeTransfers,
      (message: string) =>
        Result.fail(
          new QueuedUpdateError(
            message !== QueuedUpdateError.reasons.CannotSyncSetup
              ? QueuedUpdateError.reasons.SyncFailure
              : QueuedUpdateError.reasons.CannotSyncSetup,
            params,
            previousState,
            {
              syncError: message,
            },
          ),
        ),
      chainReader,
      externalValidationService,
      signer,
      logger,
    );
    if (syncedResult.isError) {
      // Failed to sync channel, throw the error
      logger.error({ method, methodId, error: jsonifyError(syncedResult.getError()!) }, "Error syncing channel");
      return Result.fail(syncedResult.getError()!);
    }

    // Return that proposed update was not successfully applied, but
    // make sure to save state
    const { updatedChannel, updatedTransfer, updatedActiveTransfers } = syncedResult.getValue()!;
    return Result.ok({ updatedChannel, updatedActiveTransfers, updatedTransfer, successfullyApplied: false });
  }

  logger.debug({ method, methodId, to: update.toIdentifier, type: update.type }, "Received protocol response");

  const { update: counterpartyUpdate } = counterpartyResult.getValue();

  // verify sigs on update
  const sigRes = await validateChannelSignatures(
    updatedChannel,
    counterpartyUpdate.aliceSignature,
    counterpartyUpdate.bobSignature,
    "both",
    logger,
  );
  if (sigRes.isError) {
    const error = new QueuedUpdateError(QueuedUpdateError.reasons.BadSignatures, params, previousState, {
      recoveryError: sigRes.getError()?.message,
    });
    logger.error({ method, error: jsonifyError(error) }, "Error receiving response, will not save state!");
    return Result.fail(error);
  }

  return Result.ok({
    updatedChannel: { ...updatedChannel, latestUpdate: counterpartyUpdate },
    updatedTransfers: updatedActiveTransfers,
    updatedTransfer,
    successfullyApplied: true,
  });
}

export type OtherUpdateResult = UpdateResult & {
  previousState?: FullChannelState;
};

export async function inbound(
  update: ChannelUpdate<any>,
  previousUpdate: ChannelUpdate<any>,
  activeTransfers: FullTransferState[],
  channel: FullChannelState | undefined,
  chainReader: IVectorChainReader,
  externalValidation: IExternalValidation,
  signer: IChannelSigner,
  logger: pino.BaseLogger,
): Promise<Result<UpdateResult, QueuedUpdateError>> {
  const method = "inbound";
  const methodId = getRandomBytes32();
  logger.debug({ method, methodId }, "Method start");
  // Create a helper to handle errors so the message is sent
  // properly to the counterparty
  const returnError = async (
    reason: Values<typeof QueuedUpdateError.reasons>,
    prevUpdate: ChannelUpdate<any> = update,
    state?: FullChannelState,
    context: any = {},
  ): Promise<Result<never, QueuedUpdateError>> => {
    logger.error(
      { method, methodId, channel: update.channelAddress, error: reason, context },
      "Error responding to channel update",
    );
    const error = new QueuedUpdateError(reason, prevUpdate, state, context);
    return Result.fail(error);
  };

  // Now that you have a valid starting state, you can try to apply the
  // update, and sync if necessary.
  // Assume that our stored state has nonce `k`, and the update
  // has nonce `n`, and `k` is the latest double signed state for you. The
  // following cases exist:
  // - n <= k - 2: counterparty is behind, they must restore
  // - n == k - 1: counterparty is behind, they will sync and recover, we
  //   can ignore update
  // - n == k, single signed: counterparty is behind, ignore update
  // - n == k, double signed:
  //    - IFF the states are the same, the counterparty is behind
  //    - IFF the states are different and signed at the same nonce,
  //      that is VERY bad, and should NEVER happen
  // - n == k + 1, single signed: counterparty proposing an update,
  //   we should verify, store, + ack
  // - n == k + 1, double signed: counterparty acking our update,
  //   we should verify, store, + emit
  // - n == k + 2: counterparty is proposing or acking on top of a
  //   state we do not yet have, sync state + apply update
  // - n >= k + 3: we must restore state

  // Get the difference between the stored and received nonces
  const prevNonce = channel?.nonce ?? 0;
  const diff = update.nonce - prevNonce;

  // If we are ahead, or even, do not process update
  if (diff <= 0) {
    // NOTE: when you are out of sync as a protocol initiator, you will
    // use the information from this error to sync, then retry your update
    return returnError(QueuedUpdateError.reasons.StaleUpdate, channel!.latestUpdate, channel);
  }

  // If we are behind by more than 3, we cannot sync from their latest
  // update, and must use restore
  if (diff >= 3) {
    return returnError(QueuedUpdateError.reasons.RestoreNeeded, update, channel, {
      counterpartyLatestUpdate: previousUpdate,
      ourLatestNonce: prevNonce,
    });
  }

  // If the update nonce is ahead of the store nonce by 2, we are
  // behind by one update. We can progress the state to the correct
  // state to be updated by applying the counterparty's supplied
  // latest action
  let previousState = channel ? { ...channel } : undefined;
  if (diff === 2) {
    // Create the proper state to play the update on top of using the
    // latest update
    if (!previousUpdate) {
      return returnError(QueuedUpdateError.reasons.StaleChannel, previousUpdate, previousState);
    }

    const syncRes = await syncState(
      previousUpdate,
      previousState!,
      activeTransfers,
      (message: string) =>
        Result.fail(
          new QueuedUpdateError(
            message !== QueuedUpdateError.reasons.CannotSyncSetup
              ? QueuedUpdateError.reasons.SyncFailure
              : QueuedUpdateError.reasons.CannotSyncSetup,
            previousUpdate,
            previousState,
            {
              syncError: message,
            },
          ),
        ),
      chainReader,
      externalValidation,
      signer,
      logger,
    );
    if (syncRes.isError) {
      const error = syncRes.getError() as QueuedUpdateError;
      return returnError(error.message, error.context.update, error.context.state as FullChannelState, error.context);
    }

    const { updatedChannel: syncedChannel, updatedActiveTransfers: syncedActiveTransfers } = syncRes.getValue();

    // Set the previous state to the synced state
    previousState = syncedChannel;
    activeTransfers = syncedActiveTransfers;
  }

  // We now have the latest state for the update, and should be
  // able to play it on top of the update
  const validateRes = await validateAndApplyInboundUpdate(
    chainReader,
    externalValidation,
    signer,
    update,
    previousState,
    activeTransfers,
    logger,
  );
  if (validateRes.isError) {
    const { state: errState, params: errParams, update: errUpdate, ...usefulContext } = validateRes.getError()?.context;
    return returnError(validateRes.getError()!.message, update, previousState, usefulContext);
  }

  const { updatedChannel, updatedActiveTransfers, updatedTransfer } = validateRes.getValue();

  // Return the double signed state
  return Result.ok({ updatedActiveTransfers, updatedChannel, updatedTransfer, previousState });
}

const syncState = async (
  toSync: ChannelUpdate,
  previousState: FullChannelState,
  activeTransfers: FullTransferState[],
  handleError: (message: string) => Result<any, QueuedUpdateError>,
  chainReader: IVectorChainReader,
  externalValidation: IExternalValidation,
  signer: IChannelSigner,
  logger?: pino.BaseLogger,
) => {
  // NOTE: We do not want to sync a setup update here, because it is a
  // bit of a pain -- the only time it is valid is if we are trying to
  // send a setup update (otherwise validation would not allow you to
  // get here), and we receive a setup update to sync. To sync the setup
  // channel properly, we will have to handle the retry in the calling
  // function, so just ignore for now.
  if (toSync.type === UpdateType.setup) {
    return handleError(QueuedUpdateError.reasons.CannotSyncSetup);
  }

  // As you receive an update to sync, it should *always* be double signed.
  // If the update is not double signed, and the channel is out of sync,
  // this is indicative of a different issue (perhaps lock failure?).
  // Present signatures are already asserted to be valid via the validation,
  // here simply assert the length
  if (!toSync.aliceSignature || !toSync.bobSignature) {
    return handleError("Cannot sync single signed state");
  }

  // Apply the update + validate the signatures (NOTE: full validation is not
  // needed here because the update is already signed)
  const validateRes = await validateAndApplyInboundUpdate(
    chainReader,
    externalValidation,
    signer,
    toSync,
    previousState,
    activeTransfers,
    logger,
  );
  if (validateRes.isError) {
    return handleError(validateRes.getError()!.message);
  }

  // Return synced state
  return Result.ok(validateRes.getValue());
};
