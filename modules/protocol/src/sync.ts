import {
  ChannelUpdate,
  IVectorStore,
  UpdateType,
  IMessagingService,
  FullChannelState,
  IChannelSigner,
  Result,
  UpdateParams,
  InboundChannelUpdateError,
  OutboundChannelUpdateError,
  Values,
  IVectorChainReader,
  FullTransferState,
  IExternalValidation,
  MessagingError,
} from "@connext/vector-types";
import pino from "pino";

import { extractContextFromStore, validateChannelSignatures } from "./utils";
import { validateAndApplyInboundUpdate, validateParamsAndApplyUpdate } from "./validate";

// Function responsible for handling user-initated/outbound channel updates.
// These updates will be single signed, the function should dispatch the
// message to the counterparty, and resolve once the updated channel state
// has been persisted.
export async function outbound(
  params: UpdateParams<any>,
  storeService: IVectorStore,
  chainReader: IVectorChainReader,
  messagingService: IMessagingService,
  externalValidationService: IExternalValidation,
  signer: IChannelSigner,
  logger: pino.BaseLogger,
): Promise<
  Result<
    { updatedChannel: FullChannelState; updatedTransfers?: FullTransferState[]; updatedTransfer?: FullTransferState },
    OutboundChannelUpdateError
  >
> {
  const method = "outbound";

  // First, pull all information out from the store
  const storeRes = await extractContextFromStore(storeService, params.channelAddress);
  if (storeRes.isError) {
    return Result.fail(
      new OutboundChannelUpdateError(OutboundChannelUpdateError.reasons.StoreFailure, params, undefined, {
        message: storeRes.getError()?.message,
        method,
      }),
    );
  }

  // eslint-disable-next-line prefer-const
  let { activeTransfers, channelState: previousState } = storeRes.getValue();

  // Ensure parameters are valid, and action can be taken
  const updateRes = await validateParamsAndApplyUpdate(
    signer,
    chainReader,
    externalValidationService,
    params,
    previousState,
    activeTransfers,
    signer.publicIdentifier,
  );
  if (updateRes.isError) {
    logger.warn(
      { error: updateRes.getError()?.message, context: updateRes.getError()?.context },
      "Failed to apply proposed update",
    );
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
  logger.debug({ method, to: update.toIdentifier, type: update.type }, "Sending protocol message");
  let counterpartyResult = await messagingService.sendProtocolMessage(update, previousState?.latestUpdate);

  // IFF the result failed because the update is stale, our channel is behind
  // so we should try to sync the channel and resend the update
  let error = counterpartyResult.getError();
  if (error && error.message === InboundChannelUpdateError.reasons.StaleUpdate) {
    logger.warn(
      {
        method,
        update: update.nonce,
        counterparty: (error as InboundChannelUpdateError).update.nonce,
      },
      `Behind, syncing and retrying`,
    );

    // Get the synced state and new update
    const syncedResult = await syncStateAndRecreateUpdate(
      error as InboundChannelUpdateError,
      params,
      previousState!, // safe to do bc will fail if syncing setup (only time state is undefined)
      activeTransfers,
      storeService,
      chainReader,
      externalValidationService,
      signer,
    );
    if (syncedResult.isError) {
      // Failed to sync channel, throw the error
      logger.error({ method, error: syncedResult.getError() }, "Error syncing channel");
      return Result.fail(syncedResult.getError()!);
    }

    // Retry sending update to counterparty
    const sync = syncedResult.getValue()!;
    counterpartyResult = await messagingService.sendProtocolMessage(sync.update, sync.updatedChannel.latestUpdate);

    // Update error values + stored channel value
    error = counterpartyResult.getError();
    previousState = sync.syncedChannel;
    update = sync.update;
    updatedChannel = sync.updatedChannel;
    updatedTransfer = sync.updatedTransfer;
    updatedActiveTransfers = sync.updatedActiveTransfers;
  }

  // Error object should now be either the error from trying to sync, or the
  // original error. Either way, we do not want to handle it
  if (error) {
    // Error is for some other reason, do not retry update.
    logger.error({ method, error }, "Error receiving response, will not save state!");
    return Result.fail(
      new OutboundChannelUpdateError(
        error.message === MessagingError.reasons.Timeout
          ? OutboundChannelUpdateError.reasons.CounterpartyOffline
          : OutboundChannelUpdateError.reasons.CounterpartyFailure,
        params,
        previousState,
        {
          counterpartyError: error.message,
        },
      ),
    );
  }

  logger.debug({ method, to: update.toIdentifier, type: update.type }, "Received protocol response");

  const { update: counterpartyUpdate } = counterpartyResult.getValue();

  // verify sigs on update
  const sigRes = await validateChannelSignatures(
    updatedChannel,
    counterpartyUpdate.aliceSignature,
    counterpartyUpdate.bobSignature,
    "both",
  );
  if (sigRes.isError) {
    const error = new OutboundChannelUpdateError(
      OutboundChannelUpdateError.reasons.BadSignatures,
      params,
      previousState,
      { error: sigRes.getError()?.message },
    );
    logger.error({ method, error: error.message }, "Error receiving response, will not save state!");
    return Result.fail(error);
  }

  try {
    await storeService.saveChannelState({ ...updatedChannel, latestUpdate: counterpartyUpdate }, updatedTransfer);
    return Result.ok({
      updatedChannel: { ...updatedChannel, latestUpdate: counterpartyUpdate },
      updatedTransfers: updatedActiveTransfers,
      updatedTransfer,
    });
  } catch (e) {
    return Result.fail(
      new OutboundChannelUpdateError(
        OutboundChannelUpdateError.reasons.SaveChannelFailed,
        params,
        { ...updatedChannel, latestUpdate: counterpartyUpdate },
        {
          error: e.message,
        },
      ),
    );
  }
}

export async function inbound(
  update: ChannelUpdate<any>,
  previousUpdate: ChannelUpdate<any>,
  inbox: string,
  chainReader: IVectorChainReader,
  storeService: IVectorStore,
  messagingService: IMessagingService,
  externalValidation: IExternalValidation,
  signer: IChannelSigner,
  logger: pino.BaseLogger,
): Promise<
  Result<
    {
      updatedChannel: FullChannelState;
      updatedActiveTransfers?: FullTransferState[];
      updatedTransfer?: FullTransferState;
    },
    InboundChannelUpdateError
  >
> {
  // Create a helper to handle errors so the message is sent
  // properly to the counterparty
  const returnError = async (
    reason: Values<typeof InboundChannelUpdateError.reasons>,
    prevUpdate: ChannelUpdate<any> = update,
    state?: FullChannelState,
    context: any = {},
  ): Promise<Result<never, InboundChannelUpdateError>> => {
    logger.error(
      { method: "inbound", channel: update.channelAddress, error: reason, context },
      "Error responding to channel update",
    );
    const error = new InboundChannelUpdateError(reason, prevUpdate, state, context);
    await messagingService.respondWithProtocolError(inbox, error);
    return Result.fail(error);
  };

  const storeRes = await extractContextFromStore(storeService, update.channelAddress);
  if (storeRes.isError) {
    return returnError(InboundChannelUpdateError.reasons.StoreFailure);
  }

  // eslint-disable-next-line prefer-const
  let { activeTransfers, channelState: channelFromStore } = storeRes.getValue();

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
  const prevNonce = channelFromStore?.nonce ?? 0;
  const diff = update.nonce - prevNonce;

  // If we are ahead, or even, do not process update
  if (diff <= 0) {
    // NOTE: when you are out of sync as a protocol initiator, you will
    // use the information from this error to sync, then retry your update
    return returnError(InboundChannelUpdateError.reasons.StaleUpdate, channelFromStore!.latestUpdate, channelFromStore);
  }

  // If we are behind by more than 3, we cannot sync from their latest
  // update, and must use restore
  if (diff >= 3) {
    return returnError(InboundChannelUpdateError.reasons.StaleChannel, update, channelFromStore, {
      counterpartyLatestUpdate: previousUpdate,
    });
  }

  // If the update nonce is ahead of the store nonce by 2, we are
  // behind by one update. We can progress the state to the correct
  // state to be updated by applying the counterparty's supplied
  // latest action
  let previousState = channelFromStore ? { ...channelFromStore } : undefined;
  if (diff === 2) {
    // Create the proper state to play the update on top of using the
    // latest update
    if (!previousUpdate) {
      return returnError(InboundChannelUpdateError.reasons.StaleChannel, previousUpdate, previousState);
    }

    const syncRes = await syncState(
      previousUpdate,
      previousState!,
      activeTransfers,
      (message: string) =>
        Result.fail(
          new InboundChannelUpdateError(InboundChannelUpdateError.reasons.SyncFailure, previousUpdate, previousState, {
            error: message,
          }),
        ),
      storeService,
      chainReader,
      externalValidation,
      signer,
    );
    if (syncRes.isError) {
      const error = syncRes.getError() as InboundChannelUpdateError;
      return returnError(error.message, error.update, error.state as FullChannelState, error.context);
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
  );
  if (validateRes.isError) {
    return returnError(validateRes.getError()!.message, update, previousState, validateRes.getError()?.context);
  }

  const { updatedChannel, updatedActiveTransfers, updatedTransfer } = validateRes.getValue();

  // Save the newly signed update to your channel
  try {
    await storeService.saveChannelState(updatedChannel, updatedTransfer);
  } catch (e) {
    return returnError(InboundChannelUpdateError.reasons.SaveChannelFailed, update, previousState, {
      error: e.message,
    });
  }

  // Send response to counterparty
  await messagingService.respondToProtocolMessage(
    inbox,
    updatedChannel.latestUpdate,
    previousState ? previousState!.latestUpdate : undefined,
  );

  // Return the double signed state
  return Result.ok({ updatedActiveTransfers, updatedChannel, updatedTransfer });
}

// This function should be called in `outbound` by an update initiator
// after they have received an error from their counterparty indicating
// that the update nonce was stale (i.e. `myChannel` is behind). In this
// case, you should try to play the update and regenerate the attempted
// update to send to the counterparty
type OutboundSync = {
  update: ChannelUpdate<any>;
  syncedChannel: FullChannelState;
  updatedChannel: FullChannelState;
  updatedTransfer?: FullTransferState;
  updatedActiveTransfers: FullTransferState[];
};

const syncStateAndRecreateUpdate = async (
  receivedError: InboundChannelUpdateError,
  attemptedParams: UpdateParams<any>,
  previousState: FullChannelState,
  activeTransfers: FullTransferState[],
  storeService: IVectorStore,
  chainReader: IVectorChainReader,
  externalValidationService: IExternalValidation,
  signer: IChannelSigner,
): Promise<Result<OutboundSync, OutboundChannelUpdateError>> => {
  // When receiving an update to sync from your counterparty, you
  // must make sure you can safely apply the update to your existing
  // channel, and regenerate the requested update from the user-supplied
  // parameters.

  const counterpartyUpdate = receivedError.update;
  const syncRes = await syncState(
    counterpartyUpdate,
    previousState,
    activeTransfers,
    (message: string) =>
      Result.fail(
        new OutboundChannelUpdateError(OutboundChannelUpdateError.reasons.SyncFailure, attemptedParams, previousState, {
          error: message,
        }),
      ),
    storeService,
    chainReader,
    externalValidationService,
    signer,
  );
  if (syncRes.isError) {
    return Result.fail(syncRes.getError() as OutboundChannelUpdateError);
  }

  const { updatedChannel: syncedChannel, updatedActiveTransfers: syncedActiveTransfers } = syncRes.getValue();

  // Regenerate the proposed update
  // Must go through validation again to ensure it is still a valid update
  // against the newly synced channel
  const validationRes = await validateParamsAndApplyUpdate(
    signer,
    chainReader,
    externalValidationService,
    attemptedParams,
    syncedChannel,
    syncedActiveTransfers,
    signer.publicIdentifier,
  );

  if (validationRes.isError) {
    return Result.fail(
      new OutboundChannelUpdateError(
        OutboundChannelUpdateError.reasons.RegenerateUpdateFailed,
        attemptedParams,
        syncedChannel,
        {
          error: validationRes.getError()!.message,
        },
      ),
    );
  }

  // Return the updated channel state and the regenerated update
  return Result.ok({ ...validationRes.getValue(), syncedChannel });
};

const syncState = async (
  toSync: ChannelUpdate,
  previousState: FullChannelState,
  activeTransfers: FullTransferState[],
  handleError: (message: string) => Result<any, OutboundChannelUpdateError | InboundChannelUpdateError>,
  storeService: IVectorStore,
  chainReader: IVectorChainReader,
  externalValidation: IExternalValidation,
  signer: IChannelSigner,
) => {
  // NOTE: We do not want to sync a setup update here, because it is a
  // bit of a pain -- the only time it is valid is if we are trying to
  // send a setup update (otherwise validation would not allow you to
  // get here), and we receive a setup update to sync. To sync the setup
  // channel properly, we will have to handle the retry in the calling
  // function, so just ignore for now.
  if (toSync.type === UpdateType.setup) {
    return handleError("Cannot sync setup update");
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
  );
  if (validateRes.isError) {
    return handleError(validateRes.getError()!.message);
  }

  // Save synced state
  const { updatedChannel: syncedChannel, updatedTransfer } = validateRes.getValue()!;
  try {
    await storeService.saveChannelState(syncedChannel, updatedTransfer);
  } catch (e) {
    return handleError(e.message);
  }

  // Return synced state
  return Result.ok(validateRes.getValue());
};
