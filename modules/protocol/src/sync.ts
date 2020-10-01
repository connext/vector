import {
  ChannelUpdate,
  IVectorStore,
  UpdateType,
  IMessagingService,
  SetupUpdateDetails,
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
} from "@connext/vector-types";
import { getSignerAddressFromPublicIdentifier } from "@connext/vector-utils";
import { constants } from "ethers";
import pino from "pino";

import { validateChannelUpdateSignatures } from "./utils";
import { generateUpdate } from "./update";
import { validateAndApplyInboundUpdate, validateOutbound } from "./validate";

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
): Promise<Result<FullChannelState, OutboundChannelUpdateError>> {
  const method = "outboud";
  // Before doing anything, run the validation
  // If this passes, it is safe to force-unwrap various things that may
  // be undefined. While we may still handle the error here, it should be
  // never actually reach that code (since the validation should catch any
  // errors first)
  const validationRes = await validateOutbound(params, storeService, externalValidationService, signer);
  if (validationRes.isError) {
    logger.error({
      method,
      variable: "validationRes",
      error: validationRes.getError()?.message,
      context: validationRes.getError()?.context,
    });
    return Result.fail(validationRes.getError()!);
  }
  logger.info(
    {
      method,
    },
    "Validated outbound",
  );

  // Get the valid previous state and the valid parameters from the
  // validation result
  const { validParams, validState, activeTransfers } = validationRes.getValue()!;
  let previousState = { ...validState };

  // Generate the signed update
  const updateRes = await generateUpdate(validParams, previousState, activeTransfers, chainReader, signer, logger);
  if (updateRes.isError) {
    logger.error({
      method,
      variable: "updateRes",
      error: updateRes.getError()?.message,
      context: updateRes.getError()?.context,
    });
    return Result.fail(updateRes.getError()!);
  }
  // Get all the properly updated values
  const updateValue = updateRes.getValue();
  let update = updateValue.update;
  let nextState = updateValue.channelState;
  let transfer = updateValue.transfer;

  // Send and wait for response
  logger.info({ method, to: update.toIdentifier, type: update.type }, "Sending protocol message");
  let result = await messagingService.sendProtocolMessage(update, previousState.latestUpdate ?? undefined);

  // IFF the result failed because the update is stale, our channel is behind
  // so we should try to sync the channel and resend the update
  let error = result.getError();
  if (error && error.message === InboundChannelUpdateError.reasons.StaleUpdate) {
    logger.warn(
      {
        method,
        update: update.nonce,
        counterparty: error.update.nonce,
      },
      `Behind, syncing and retrying`,
    );

    // Get the synced state and new update
    const syncedResult = await syncStateAndRecreateUpdate(
      error,
      params,
      previousState,
      storeService,
      chainReader,
      externalValidationService,
      signer,
      logger,
    );
    if (syncedResult.isError) {
      // Failed to sync channel, throw the error
      logger.error({ method, error: syncedResult.getError() }, "Error syncing channel");
      return Result.fail(syncedResult.getError()!);
    }

    // Retry sending update to counterparty
    const {
      regeneratedUpdate,
      syncedChannel,
      proposedChannel,
      transfer: regeneratedTransfer,
    } = syncedResult.getValue()!;
    result = await messagingService.sendProtocolMessage(regeneratedUpdate, syncedChannel.latestUpdate);

    // Update error values + stored channel value
    error = result.getError();
    previousState = syncedChannel;
    update = regeneratedUpdate;
    nextState = proposedChannel;
    transfer = regeneratedTransfer;
  }

  // Error object should now be either the error from trying to sync, or the
  // original error. Either way, we do not want to handle it
  if (error) {
    // Error is for some other reason, do not retry update.
    logger.error({ method, error }, "Error receiving response, will not save state!");
    return Result.fail(
      new OutboundChannelUpdateError(OutboundChannelUpdateError.reasons.CounterpartyFailure, params, previousState, {
        counterpartyError: error.message,
      }),
    );
  }

  logger.info({ method, to: update.toIdentifier, type: update.type }, "Received protocol response");

  const { update: counterpartyUpdate } = result.getValue();

  // verify sigs on update
  const sigRes = await validateChannelUpdateSignatures(
    nextState,
    counterpartyUpdate.aliceSignature,
    counterpartyUpdate.bobSignature,
    "both",
  );
  if (sigRes) {
    const error = new OutboundChannelUpdateError(
      OutboundChannelUpdateError.reasons.BadSignatures,
      params,
      previousState,
      { error: sigRes },
    );
    logger.error({ method, error: error.message }, "Error receiving response, will not save state!");
    return Result.fail(error);
  }

  try {
    await storeService.saveChannelState(
      { ...nextState, latestUpdate: counterpartyUpdate },
      {
        channelFactoryAddress: nextState.networkContext.channelFactoryAddress,
        state: nextState,
        chainId: nextState.networkContext.chainId,
        aliceSignature: counterpartyUpdate.aliceSignature,
        bobSignature: counterpartyUpdate.bobSignature,
      },
      transfer,
    );
    return Result.ok({ ...nextState, latestUpdate: counterpartyUpdate });
  } catch (e) {
    logger.error("e", e.message);
    return Result.fail(
      new OutboundChannelUpdateError(
        OutboundChannelUpdateError.reasons.SaveChannelFailed,
        params,
        { ...nextState, latestUpdate: counterpartyUpdate },
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
): Promise<Result<FullChannelState, InboundChannelUpdateError>> {
  let channelFromStore = await storeService.getChannelState(update.channelAddress);

  // Create a helper to handle errors so the message is sent
  // properly to the counterparty
  const returnError = async (
    reason: Values<typeof InboundChannelUpdateError.reasons>,
    prevUpdate: ChannelUpdate<any> = update,
    state?: FullChannelState,
    context: any = {},
  ): Promise<Result<FullChannelState, InboundChannelUpdateError>> => {
    logger.error(
      { method: "inbound", channel: update.channelAddress, error: reason, context },
      "Error responding to channel update",
    );
    const error = new InboundChannelUpdateError(reason, prevUpdate, state, context);
    await messagingService.respondWithProtocolError(inbox, error);
    return Result.fail(error);
  };

  // You cannot apply the update directly using the inbound validation,
  // because the validation function only validates single state
  // transitions from nonce n -> n + 1. As a consequence, if your channel
  // does not exist in the store, you should create an empty channel state
  // under the assumption that he only case where it is okay to not have
  // a channel in your store, is where you are receiving (or at some
  // point will sync) a setup update.

  // If the channel does not exist, generate an empty channel state
  if (!channelFromStore) {
    // Make sure the proposed update or the previous update is a setup
    // update, and get all the appropriate initial empty state values
    if (update.type !== UpdateType.setup && previousUpdate.type !== UpdateType.setup) {
      return returnError(InboundChannelUpdateError.reasons.ChannelNotFound);
    }
    const networkContext =
      update.type === UpdateType.setup
        ? (update.details as SetupUpdateDetails).networkContext
        : (previousUpdate.details as SetupUpdateDetails).networkContext;
    const timeout =
      update.type === UpdateType.setup
        ? (update.details as SetupUpdateDetails).timeout
        : (previousUpdate.details as SetupUpdateDetails).timeout;

    const channelAddress = update.type === UpdateType.setup ? update.channelAddress : previousUpdate.channelAddress;

    channelFromStore = {
      channelAddress,
      alice: getSignerAddressFromPublicIdentifier(update.fromIdentifier),
      bob: signer.address,
      networkContext,
      assetIds: [],
      balances: [],
      processedDepositsA: [],
      processedDepositsB: [],
      merkleRoot: constants.HashZero,
      nonce: 0,
      aliceIdentifier: update.fromIdentifier,
      bobIdentifier: signer.publicIdentifier,
      timeout,
      latestUpdate: {} as any, // There is no latest update on setup
    };
  }

  // Now that you have a valid starting state, you can try to apply the
  // update, and sync if necessary.
  // Assume that our stored state has nonce `k`, and the update
  // has nonce `n`, and `k` is the latest double signed state for you. The
  // following cases exist:
  // - n < k - 2: counterparty is behind, they must restore
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
  const diff = update.nonce - channelFromStore!.nonce;

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
  let previousState = { ...channelFromStore! };
  if (diff === 2) {
    // Create the proper state to play the update on top of using the
    // latest update
    if (!previousUpdate) {
      return returnError(InboundChannelUpdateError.reasons.StaleChannel, previousUpdate, previousState);
    }

    // Only sync an update IFF it is double signed
    // NOTE: validation will ensure the signatures present are valid
    if (!previousUpdate.aliceSignature || !previousUpdate.bobSignature) {
      return returnError(InboundChannelUpdateError.reasons.SyncSingleSigned, previousUpdate, previousState);
    }

    // Validate, apply, and cosign the update to sync
    const validateRes = await validateAndApplyInboundUpdate(
      previousUpdate,
      previousState,
      storeService,
      chainReader,
      externalValidation,
      signer,
      logger,
    );
    if (validateRes.isError) {
      return returnError(validateRes.getError()!.message, previousUpdate, previousState);
    }

    const { commitment, nextState: syncedChannel, transfer } = validateRes.getValue()!;

    // Save the newly signed update to your channel
    await storeService.saveChannelState(syncedChannel, commitment, transfer);

    // Set the previous state to the synced state
    previousState = syncedChannel;
  }

  // We now have the latest state for the update, and should be
  // able to play it on top of the update
  const validateRes = await validateAndApplyInboundUpdate(
    update,
    previousState,
    storeService,
    chainReader,
    externalValidation,
    signer,
    logger,
  );
  if (validateRes.isError) {
    return returnError(validateRes.getError()!.message, update, previousState);
  }

  const { commitment, nextState, transfer } = validateRes.getValue()!;

  // Save the newly signed update to your channel
  try {
    await storeService.saveChannelState(nextState, commitment, transfer);
  } catch (e) {
    return returnError(InboundChannelUpdateError.reasons.SaveChannelFailed, update, previousState, {
      error: e.message,
    });
  }

  // Send response to counterparty
  await messagingService.respondToProtocolMessage(inbox, nextState.latestUpdate, previousState.latestUpdate);

  // Return the double signed state
  return Result.ok(nextState);
}

// This function should be called in `outbound` by an update initiator
// after they have received an error from their counterparty indicating
// that the update nonce was stale (i.e. `myChannel` is behind). In this
// case, you should try to play the update and regenerate the attempted
// update to send to the counterparty
type OutboundSync = {
  regeneratedUpdate: ChannelUpdate<any>;
  syncedChannel: FullChannelState<any>;
  proposedChannel: FullChannelState<any>;
  transfer?: FullTransferState;
};
const syncStateAndRecreateUpdate = async (
  receivedError: InboundChannelUpdateError,
  attemptedParams: UpdateParams<any>,
  previousState: FullChannelState,
  storeService: IVectorStore,
  chainReader: IVectorChainReader,
  externalValidation: IExternalValidation,
  signer: IChannelSigner,
  logger: pino.BaseLogger = pino(),
): Promise<Result<OutboundSync, OutboundChannelUpdateError>> => {
  // When receiving an update to sync from your counterparty, you
  // must make sure you can safely apply the update to your existing
  // channel, and regenerate the requested update from the user-supplied
  // parameters.

  const counterpartyUpdate = receivedError.update;
  // NOTE: We do not want to sync a setup update here, because it is a
  // bit of a pain -- the only time it is valid is if we are trying to
  // send a setup update (otherwise validation would not allow you to
  // get here), and we receive a setup update to sync. To sync the setup
  // channel properly, we will have to handle the retry in the calling
  // function, so just ignore for now.
  if (counterpartyUpdate.type === UpdateType.setup) {
    return Result.fail(
      new OutboundChannelUpdateError(OutboundChannelUpdateError.reasons.SyncFailure, attemptedParams, previousState, {
        error: "Cannot sync setup update",
        counterpartyError: receivedError.message,
      }),
    );
  }

  // As you receive an update to sync, it should *always* be double signed.
  // If the update is not double signed, and the channel is out of sync,
  // this is indicative of a different issue (perhaps lock failure?).
  // Present signatures are already asserted to be valid via the validation,
  // here simply assert the length
  if (!counterpartyUpdate.aliceSignature || !counterpartyUpdate.bobSignature) {
    return Result.fail(
      new OutboundChannelUpdateError(
        OutboundChannelUpdateError.reasons.SyncSingleSigned,
        counterpartyUpdate,
        previousState,
      ),
    );
  }

  // Validate, apply, and sign the update
  const validateRes = await validateAndApplyInboundUpdate(
    counterpartyUpdate,
    previousState,
    storeService,
    chainReader,
    externalValidation,
    signer,
    logger,
  );
  if (validateRes.isError) {
    return Result.fail(
      new OutboundChannelUpdateError(OutboundChannelUpdateError.reasons.SyncFailure, attemptedParams, previousState, {
        error: `Invalid update to sync: ${validateRes.getError()?.message}`,
        counterpartyError: receivedError.message,
      }),
    );
  }

  const { commitment, nextState: syncedChannel, transfer, activeTransfers } = validateRes.getValue()!;

  // Save the newly signed update to your channel
  await storeService.saveChannelState(syncedChannel, commitment, transfer);

  // Update successfully validated and applied to channel, now
  // regenerate the update to send to the counterparty from the
  // given parameters
  // FIXME: generateBaseUpdate will fail when you are creating updates as
  // an update responder
  const generateRes = await generateUpdate(
    attemptedParams,
    syncedChannel,
    activeTransfers,
    chainReader,
    signer,
    logger,
  );
  if (generateRes.isError) {
    return Result.fail(
      new OutboundChannelUpdateError(
        OutboundChannelUpdateError.reasons.RegenerateUpdateFailed,
        attemptedParams,
        syncedChannel,
        {
          error: generateRes.getError()!.message,
        },
      ),
    );
  }
  const {
    update: regeneratedUpdate,
    channelState: proposedChannel,
    transfer: regeneratedTransfer,
  } = generateRes.getValue()!;
  // Return the updated channel state and the regenerated update
  return Result.ok({ syncedChannel, regeneratedUpdate, proposedChannel, transfer: regeneratedTransfer });
};
