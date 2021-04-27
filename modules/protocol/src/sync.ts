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
import { getNextNonceForUpdate, validateChannelSignatures } from "./utils";
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
  getUpdatedMerkleRoot: (
    channelAddress: string,
    activeTransfers: FullTransferState[],
    transfer: FullTransferState,
    update: typeof UpdateType.create | typeof UpdateType.resolve,
  ) => string,
  undoMerkleRootUpdates: (
    channelAddress: string,
    transferToUndo: string,
    updateToUndo: typeof UpdateType.create | typeof UpdateType.resolve,
  ) => Promise<void>,
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
    getUpdatedMerkleRoot,
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

    // NOTE: because you have already updated the merkle root here,
    // you must undo the updates before syncing otherwise you cannot
    // safely sync properly (merkle root may be incorrect when
    // generating a new one). This is otherwise handled in the queued
    // update
    if (update.type === UpdateType.create || update.type === UpdateType.resolve) {
      await undoMerkleRootUpdates(params.channelAddress, updatedTransfer!.transferId, update.type);
    }

    // Get the synced state and new update
    const syncedResult = await syncState(
      error.context.update,
      previousState!, // safe to do bc will fail if syncing setup (only time state is undefined)
      activeTransfers,
      (message: Values<typeof QueuedUpdateError.reasons>) =>
        Result.fail(
          new QueuedUpdateError(message, params, previousState, {
            syncError: message,
          }),
        ),
      chainReader,
      externalValidationService,
      signer,
      getUpdatedMerkleRoot,
      logger,
    );
    if (syncedResult.isError) {
      // Failed to sync channel, throw the error
      logger.error({ method, methodId, error: jsonifyError(syncedResult.getError()!) }, "Error syncing channel");
      return Result.fail(syncedResult.getError()!);
    }

    // Return that proposed update was not successfully applied, but
    // make sure to save state
    const {
      updatedChannel: syncedChannel,
      updatedTransfer: syncedTransfer,
      updatedActiveTransfers: syncedActiveTransfers,
    } = syncedResult.getValue()!;
    return Result.ok({
      updatedChannel: syncedChannel,
      updatedActiveTransfers: syncedActiveTransfers,
      updatedTransfer: syncedTransfer,
      successfullyApplied: false,
    });
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
  getUpdatedMerkleRoot: (
    channelAddress: string,
    activeTransfers: FullTransferState[],
    transfer: FullTransferState,
    update: typeof UpdateType.create | typeof UpdateType.resolve,
  ) => string,
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
  // (a) counterparty is behind, and they must restore (>1 transition behind)
  // (b) counterparty is behind, but their state is syncable (1 transition
  //     behind)
  // (c) we are in sync, can apply update directly
  // (d) we are behind, and must sync before applying update (1 transition
  //     behind)
  // (e) we are behind, and must restore before applying update (>1
  //     transition behind)

  // Nonce transitions for these cases:
  // (a,b) update.nonce <= expectedInSync -- restore case handled in syncState
  // (c) update.nonce === expectedInSync -- perform update
  // (d,e) update.nonce > expectedInSync -- restore case handled in syncState

  // Get the difference between the stored and received nonces
  const ourPreviousNonce = channel?.latestUpdate?.nonce ?? -1;

  // Get the expected previous update nonce
  const givenPreviousNonce = previousUpdate?.nonce ?? -1;

  if (givenPreviousNonce < ourPreviousNonce) {
    // NOTE: when you are out of sync as a protocol initiator, you will
    // use the information from this error to sync, then retry your update
    return returnError(QueuedUpdateError.reasons.StaleUpdate, channel!.latestUpdate, channel);
  }

  let previousState = channel ? { ...channel } : undefined;
  if (givenPreviousNonce > ourPreviousNonce) {
    // Create the proper state to play the update on top of using the
    // latest update
    if (!previousUpdate) {
      return returnError(QueuedUpdateError.reasons.StaleChannel, previousUpdate, previousState);
    }

    const syncRes = await syncState(
      previousUpdate,
      previousState!,
      activeTransfers,
      (message: Values<typeof QueuedUpdateError.reasons>) =>
        Result.fail(
          new QueuedUpdateError(message, previousUpdate, previousState, {
            syncError: message,
          }),
        ),
      chainReader,
      externalValidation,
      signer,
      getUpdatedMerkleRoot,
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

  // Should be fully in sync, safe to apply provided update

  // We now have the latest state for the update, and should be
  // able to play it on top of the update
  const validateRes = await validateAndApplyInboundUpdate(
    chainReader,
    externalValidation,
    signer,
    update,
    previousState,
    activeTransfers,
    getUpdatedMerkleRoot,
    logger,
  );
  if (validateRes.isError) {
    const { state: errState, params: errParams, update: errUpdate, ...usefulContext } = validateRes.getError()?.context;
    return returnError(validateRes.getError()!.message, update, previousState, usefulContext);
  }

  const { updatedChannel, updatedActiveTransfers, updatedTransfer } = validateRes.getValue();

  // Return the double signed state
  return Result.ok({ updatedTransfers: updatedActiveTransfers, updatedChannel, updatedTransfer, previousState });
}

const syncState = async (
  toSync: ChannelUpdate,
  previousState: FullChannelState,
  activeTransfers: FullTransferState[],
  handleError: (message: Values<typeof QueuedUpdateError.reasons>) => Result<any, QueuedUpdateError>,
  chainReader: IVectorChainReader,
  externalValidation: IExternalValidation,
  signer: IChannelSigner,
  getUpdatedMerkleRoot: (
    channelAddress: string,
    activeTransfers: FullTransferState[],
    transfer: FullTransferState,
    update: typeof UpdateType.create | typeof UpdateType.resolve,
  ) => string,
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
    return handleError(QueuedUpdateError.reasons.SyncSingleSigned);
  }

  // Make sure the nonce is only one transition from what we expect.
  // If not, we must restore.
  const expected = getNextNonceForUpdate(previousState.nonce, toSync.fromIdentifier === previousState.aliceIdentifier);
  if (toSync.nonce !== expected) {
    return handleError(QueuedUpdateError.reasons.RestoreNeeded);
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
    getUpdatedMerkleRoot,
    logger,
  );
  if (validateRes.isError) {
    return handleError(validateRes.getError()!.message);
  }

  // Return synced state
  return Result.ok(validateRes.getValue());
};
