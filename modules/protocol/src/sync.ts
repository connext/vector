import {
  ChannelUpdate,
  IVectorStore,
  UpdateType,
  IMessagingService,
  SetupUpdateDetails,
  FullChannelState,
  IChannelSigner,
  Result,
  ChannelCommitmentData,
  FullTransferState,
  TransferCommitmentData,
  ResolveUpdateDetails,
  UpdateParams,
  IVectorOnchainService,
  InboundChannelUpdateError,
  OutboundChannelUpdateError,
  CreateUpdateDetails,
} from "@connext/vector-types";
import { getSignerAddressFromPublicIdentifier, hashTransferState } from "@connext/vector-utils";
import { constants } from "ethers";
import pino from "pino";

import { generateSignedChannelCommitment, validateChannelUpdateSignatures } from "./utils";
import { applyUpdate, generateUpdate } from "./update";
import { validateInbound, validateOutbound } from "./validate";

// Function responsible for handling user-initated/outbound channel updates.
// These updates will be single signed, the function should dispatch the
// message to the counterparty, and resolve once the updated channel state
// has been persisted.
export async function outbound(
  params: UpdateParams<any>,
  storeService: IVectorStore,
  onchainService: IVectorOnchainService,
  messagingService: IMessagingService,
  signer: IChannelSigner,
  logger: pino.BaseLogger = pino(),
): Promise<Result<FullChannelState, OutboundChannelUpdateError>> {
  // Before doing anything, run the validation
  // If this passes, it is safe to force-unwrap various things that may
  // be undefined. While we may still handle the error here, it should be
  // never actually reach that code (since the validation should catch any
  // errors first)
  const validationRes = await validateOutbound(params, storeService, onchainService, signer, logger);
  if (validationRes.isError) {
    logger.error({ method: "outbound", variable: "validationRes", error: validationRes.getError()?.message });
    return Result.fail(validationRes.getError()!);
  }

  // Get the valid previous state and the valid parameters from the
  // validation result
  const { validParams, validState, activeTransfers, transfer } = validationRes.getValue()!;
  let previousState = validState;

  // Generate the signed update
  const updateRes = await generateUpdate(
    validParams,
    previousState,
    activeTransfers,
    transfer,
    onchainService,
    signer,
    logger,
  );
  if (updateRes.isError) {
    logger.error({ method: "outbound", variable: "updateRes", error: updateRes.getError()?.message });
    return Result.fail(updateRes.getError()!);
  }
  const updateValue = updateRes.getValue();
  const update = updateValue.update;
  let updatedChannel = updateValue.channelState;

  // send and wait for response
  logger.info({ method: "outbound", to: update.toIdentifier, type: update.type }, "Sending protocol message");
  let result = await messagingService.sendProtocolMessage(update, previousState.latestUpdate ?? undefined);

  // iff the result failed because the update is stale, our channel is behind
  // so we should try to sync the channel and resend the update
  let error = result.getError();
  if (error && error.message === InboundChannelUpdateError.reasons.StaleUpdate) {
    logger.warn(
      {
        update: update.nonce,
        counterparty: error.update.nonce,
      },
      `Out of sync, syncing and retrying`,
    );

    // Get the synced state and new update
    const syncedResult = await syncStateAndRecreateUpdate(
      error,
      params,
      previousState,
      storeService,
      onchainService,
      signer,
      logger,
    );
    if (syncedResult.isError) {
      // Failed to sync channel, throw the error
      logger.error({ method: "outbound", error: syncedResult.getError() }, "Error syncing channel");
      return Result.fail(syncedResult.getError()!);
    }

    // Retry sending update to counterparty
    const { regeneratedUpdate, syncedChannel, proposedChannel: proposedState } = syncedResult.getValue()!;
    result = await messagingService.sendProtocolMessage(regeneratedUpdate, syncedChannel.latestUpdate);

    // Update error values + stored channel value
    error = result.getError();
    previousState = syncedChannel;
    updatedChannel = proposedState;
  }

  // Error object should now be either the error from trying to sync, or the
  // original error. Either way, we do not want to handle it
  if (error) {
    // Error is for some other reason, do not retry update.
    logger.error({ method: "outbound", error }, "Error receiving response, will not save state!");
    return Result.fail(
      new OutboundChannelUpdateError(OutboundChannelUpdateError.reasons.CounterpartyFailure, params, previousState, {
        counterpartyError: error.message,
      }),
    );
  }

  logger.info({ method: "outbound", to: update.toIdentifier, type: update.type }, "Received protocol response");

  const channelUpdateFromCounterparty = result.getValue();

  // // get transfer state if needed
  // let transfer: FullTransferState | undefined;
  // if (update.type === UpdateType.resolve) {
  //   transfer = await storeService.getTransferState((update.details as ResolveUpdateDetails).transferId);
  //   if (!transfer) {
  //     return Result.fail(
  //       new OutboundChannelUpdateError(OutboundChannelUpdateError.reasons.TransferNotFound, params, storedChannel),
  //     );
  //   }
  //   transfer.transferResolver = (update.details as ResolveUpdateDetails).transferResolver;
  // }

  // if (update.type === UpdateType.create) {
  //   const details = update.details as CreateUpdateDetails;
  //   transfer = {
  //     initialBalance: details.transferInitialState.balance,
  //     assetId: update.assetId,
  //     transferId: details.transferId,
  //     channelAddress: update.channelAddress,
  //     transferDefinition: details.transferDefinition,
  //     transferEncodings: details.transferEncodings,
  //     transferTimeout: details.transferTimeout,
  //     initialStateHash: hashTransferState(details.transferInitialState, details.transferEncodings[0]),
  //     transferState: details.transferInitialState,
  //     channelFactoryAddress: updatedChannel.networkContext.channelFactoryAddress,
  //     chainId: updatedChannel.networkContext.chainId,
  //     meta: details.meta,
  //   };
  // }

  // verify sigs on update
  const sigRes = await validateChannelUpdateSignatures(
    updatedChannel,
    channelUpdateFromCounterparty.update.signatures,
    2,
  );
  if (sigRes) {
    const error = new OutboundChannelUpdateError(
      OutboundChannelUpdateError.reasons.BadSignatures,
      params,
      storedChannel,
      { error: sigRes },
    );
    logger.error({ method: "outbound", error: error.message }, "Error receiving response, will not save state!");
    return Result.fail(error);
  }

  try {
    await storeService.saveChannelState(
      { ...updatedChannel, latestUpdate: channelUpdateFromCounterparty.update },
      {
        channelFactoryAddress: updatedChannel.networkContext.channelFactoryAddress,
        state: updatedChannel,
        chainId: updatedChannel.networkContext.chainId,
        signatures: channelUpdateFromCounterparty.update.signatures,
      },
      transfer,
    );
    return Result.ok({ ...updatedChannel, latestUpdate: channelUpdateFromCounterparty.update });
  } catch (e) {
    return Result.fail(
      new OutboundChannelUpdateError(
        OutboundChannelUpdateError.reasons.SaveChannelFailed,
        params,
        { ...updatedChannel, latestUpdate: channelUpdateFromCounterparty.update },
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
  storeService: IVectorStore,
  messagingService: IMessagingService,
  signer: IChannelSigner,
  logger: pino.BaseLogger,
): Promise<Result<FullChannelState, InboundChannelUpdateError>> {
  let channelFromStore = await storeService.getChannelState(update.channelAddress);
  if (!channelFromStore) {
    if (update.type !== UpdateType.setup) {
      return Result.fail(new InboundChannelUpdateError(InboundChannelUpdateError.reasons.ChannelNotFound, update));
    }

    const publicIdentifiers =
      update.signatures.filter(x => !!x).length === 1
        ? [update.fromIdentifier, update.toIdentifier]
        : [update.toIdentifier, update.fromIdentifier];

    channelFromStore = {
      channelAddress: update.channelAddress,
      participants: publicIdentifiers.map(getSignerAddressFromPublicIdentifier),
      networkContext: (update.details as SetupUpdateDetails).networkContext,
      assetIds: [],
      balances: [],
      lockedBalance: [],
      merkleRoot: constants.HashZero,
      nonce: 0,
      publicIdentifiers,
      timeout: (update.details as SetupUpdateDetails).timeout,
      latestUpdate: {} as any, // There is no latest update on setup
      latestDepositNonce: 0,
    };
  }
  // get transfer state if needed
  let transfer: FullTransferState | undefined;
  if (update.type === UpdateType.create) {
    const details = update.details as CreateUpdateDetails;
    transfer = {
      initialBalance: details.transferInitialState.balance,
      assetId: update.assetId,
      transferId: details.transferId,
      channelAddress: update.channelAddress,
      transferDefinition: details.transferDefinition,
      transferEncodings: details.transferEncodings,
      transferTimeout: details.transferTimeout,
      initialStateHash: hashTransferState(details.transferInitialState, details.transferEncodings[0]),
      transferState: details.transferInitialState,
      channelFactoryAddress: channelFromStore.networkContext.channelFactoryAddress,
      chainId: channelFromStore.networkContext.chainId,
      meta: details.meta,
    };
  }

  if (update.type === UpdateType.resolve) {
    transfer = await storeService.getTransferState((update.details as ResolveUpdateDetails).transferId);
    if (!transfer) {
      return Result.fail(
        new InboundChannelUpdateError(OutboundChannelUpdateError.reasons.TransferNotFound, update, channelFromStore),
      );
    }
    transfer.transferResolver = (update.details as ResolveUpdateDetails).transferResolver;
  }

  // validate and merge
  const inboundRes = await validateIncomingChannelUpdate(update, previousUpdate, channelFromStore, transfer);
  if (inboundRes.isError) {
    logger.error(
      { method: "inbound", channel: update.channelAddress, error: inboundRes.getError()?.message },
      "Error validating incoming channel update",
    );
    messagingService.respondWithProtocolError(inbox, inboundRes.getError()!);
    return inboundRes;
  }
  const updatedChannelState = inboundRes.getValue();

  // sign update
  const signed = await signData(updatedChannelState, update, signer, transfer);
  // save channel
  try {
    await storeService.saveChannelState(signed.channel, signed.commitment, transfer);
  } catch (e) {
    logger.error({ method: "inbound", channel: update.channelAddress, error: e.message }, "Error saving channel state");
    const error = new InboundChannelUpdateError(
      InboundChannelUpdateError.reasons.SaveChannelFailed,
      update,
      signed.channel,
      { error: e.message },
    );
    messagingService.respondWithProtocolError(inbox, error);
    return Result.fail(error);
  }

  // send to counterparty
  await messagingService.respondToProtocolMessage(inbox, signed.channel.latestUpdate, channelFromStore.latestUpdate);
  return inboundRes;
}

// This function is responsible for handling any inbound state requests.
async function validateIncomingChannelUpdate(
  requestedUpdate: ChannelUpdate<any>,
  counterpartyLatestUpdate: ChannelUpdate<any>,
  myState: FullChannelState,
  transfer?: FullTransferState,
): Promise<Result<FullChannelState, InboundChannelUpdateError>> {
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

  // NOTE: by including the proposed update and the latest update, we are
  // able to automatically recover within the `inbound` function if we
  // are behind. There is an argument to be made that any syncing of
  // state and not explicitly progressing of state should be handled
  // outside of this function

  // Before proceeding, verify any signatures present are correct
  // await requestedUpdate.commitment.assertSignatures();
  // const requestedResult = await requestedUpdate.commitment.assertSignatures();
  // if (requestedResult.isError) {
  //   const error = await handleError(
  //     new ChannelUpdateError(ChannelUpdateError.reasons.BadSignatures, requestedUpdate, storedState, {
  //       counterpartyLatestUpdate,
  //       error: requestedResult.getError().message,
  //     }),
  //   );
  //   return Result.fail(error)
  // }

  // Get the difference between the stored and received nonces
  const diff = requestedUpdate.nonce - myState.nonce;

  // If we are ahead, or even, do not process update
  if (diff <= 0) {
    // NOTE: when you are out of sync as a protocol initiator, you will
    // use the information from this error to sync, then retry your update

    // FIXME: We don't need to pass everything over the wire here, fix that
    return Result.fail(
      new InboundChannelUpdateError(InboundChannelUpdateError.reasons.StaleUpdate, myState.latestUpdate, myState, {
        requestedUpdate,
      }),
    );
  }

  // If we are behind by more than 3, we cannot sync from their latest
  // update, and must use restore
  if (diff >= 3) {
    return Result.fail(
      new InboundChannelUpdateError(InboundChannelUpdateError.reasons.StaleChannel, requestedUpdate, myState, {
        counterpartyLatestUpdate,
      }),
    );
  }

  // If the update nonce is ahead of the store nonce by 2, we are
  // behind by one update. We can progress the state to the correct
  // state to be updated by applying the counterparty's supplied
  // latest action
  let previousState = { ...myState };
  if (diff === 2) {
    // Create the proper state to play the update on top of using the
    // latest update
    if (!counterpartyLatestUpdate) {
      return Result.fail(
        new InboundChannelUpdateError(
          InboundChannelUpdateError.reasons.StaleChannelNoUpdate,
          counterpartyLatestUpdate,
          myState,
          { requestedUpdate },
        ),
      );
    }
    const mergeRes = await mergeIncomingUpdate(counterpartyLatestUpdate, myState, transfer);
    if (mergeRes.isError) {
      return Result.fail(
        new InboundChannelUpdateError(
          InboundChannelUpdateError.reasons.ApplyUpdateFailed,
          counterpartyLatestUpdate,
          myState,
          {
            requestedUpdate,
            error: mergeRes.getError()!.message,
            stack: mergeRes.getError()!.stack,
          },
        ),
      );
    }
    previousState = mergeRes.getValue();
  }

  // We now have the latest state for the update, and should be
  // able to play it on top of the update
  const mergeRes = await mergeIncomingUpdate(requestedUpdate, previousState, transfer);
  if (mergeRes.isError) {
    return Result.fail(
      new InboundChannelUpdateError(
        InboundChannelUpdateError.reasons.ApplyUpdateFailed,
        requestedUpdate,
        previousState,
        {
          counterpartyLatestUpdate,
          error: mergeRes.getError()!.message,
        },
      ),
    );
  }
  const response = mergeRes.getValue()!;
  return Result.ok(response);
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
};
const syncStateAndRecreateUpdate = async (
  receivedError: InboundChannelUpdateError,
  attemptedParams: UpdateParams<any>,
  previousState: FullChannelState,
  storeService: IVectorStore,
  onchainService: IVectorOnchainService,
  signer: IChannelSigner,
  logger: pino.BaseLogger = pino(),
): Promise<Result<OutboundSync, OutboundChannelUpdateError>> => {
  // When receiving an update to sync from your counterparty, you
  // must make sure you can safely apply the update to your existing
  // channel, and regenerate the requested update from the user-supplied
  // parameters.

  const counterpartyUpdate = receivedError.update;
  // You would not be able to setup a channel with a counter-
  // party twice, and this should be handled on validation. A sync
  // here is likely indicative of a store issue, do not sync
  if (counterpartyUpdate.type === UpdateType.setup) {
    return Result.fail(
      new OutboundChannelUpdateError(OutboundChannelUpdateError.reasons.SyncFailure, attemptedParams, previousState, {
        error: "Cannot sync setup update",
        counterpartyError: receivedError.message,
      }),
    );
  }

  // Additionally, the update must be at nonce n + 1 to be applied to
  // a channel at nonce n safely
  if (counterpartyUpdate.nonce !== previousState.nonce + 1) {
    return Result.fail(
      new OutboundChannelUpdateError(OutboundChannelUpdateError.reasons.RestoreNeeded, attemptedParams, previousState, {
        counterpartyError: receivedError.message,
        counterpartyUpdate: counterpartyUpdate.nonce,
      }),
    );
  }

  // Validate the update
  const validateRes = await validateInbound(
    counterpartyUpdate,
    previousState,
    storeService,
    onchainService,
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

  const { validUpdate, validState, transfer, activeTransfers } = validateRes.getValue()!;

  // Try to apply the incoming update to the channel
  // As you receive an update, it should *always* be double signed. If
  // the update is not double signed, and the channel is out of sync,
  // this is indicative of a different issue (perhaps lock failure?).
  // Present signatures are already asserted to be valid via the validation,
  // here simply assert the length
  if (counterpartyUpdate.signatures.filter(x => !!x).length !== 2) {
    return Result.fail(
      new OutboundChannelUpdateError(
        OutboundChannelUpdateError.reasons.SyncSingleSigned,
        validUpdate,
        previousState,
      ),
    );
  }

  // Apply the update
  const applyRes = await applyUpdate(validUpdate, validState, transfer?.transferState);
  if (applyRes.isError) {
    return Result.fail(
      new OutboundChannelUpdateError(OutboundChannelUpdateError.reasons.SyncFailure, attemptedParams, previousState, {
        error: applyRes.getError()!.message,
        counterpartyUpdate: counterpartyUpdate,
        counterpartyError: receivedError.message,
      }),
    );
  }
  const syncedChannel = applyRes.getValue()!;

  const sigRes = await validateChannelUpdateSignatures(syncedChannel, counterpartyUpdate.signatures, 2);
  if (sigRes) {
    return Result.fail(
      new OutboundChannelUpdateError(OutboundChannelUpdateError.reasons.BadSignatures, attemptedParams, previousState, {
        error: sigRes,
        counterpartyUpdate: counterpartyUpdate,
        counterpartyError: receivedError.message,
      }),
    );
  }

  // Save the newly signed update to your channel
  await storeService.saveChannelState(
    syncedChannel,
    await generateSignedChannelCommitment(syncedChannel, signer, counterpartyUpdate.signatures),
    transfer,
  );

  // Update successfully validated and applied to channel, now
  // regenerate the update to send to the counterparty from the
  // given parameters
  const generateRes = await generateUpdate(
    attemptedParams,
    syncedChannel,
    activeTransfers,
    transfer,
    onchainService,
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
  const { update: regeneratedUpdate, channelState: proposedChannel } = generateRes.getValue()!;
  // Return the updated channel state and the regenerated update
  return Result.ok({ syncedChannel, regeneratedUpdate, proposedChannel });
};

const mergeIncomingUpdate = async (
  update: ChannelUpdate<any>,
  state: FullChannelState,
  transfer?: FullTransferState,
): Promise<Result<FullChannelState, InboundChannelUpdateError>> => {
  await validateInbound(update, state);
  const result = await applyUpdate(update, state, transfer);
  return result;
};

const signData = async (
  newState: FullChannelState,
  update: ChannelUpdate<any>, // Should be single- or un-signed
  signer: IChannelSigner,
  transfer?: FullTransferState,
): Promise<{ channel: FullChannelState; commitment: ChannelCommitmentData; updatedTransfer?: FullTransferState }> => {
  const signed = await generateSignedChannelCommitment(newState, signer, update.signatures);

  const transferId =
    update.type === UpdateType.create || update.type === UpdateType.resolve ? update.details.transferId : undefined;

  const signedUpdate = { ...update, signatures: signed.signatures };

  if (!transferId) {
    // Not a transfer update, no need to include transfer
    // record details
    return { channel: { ...newState, latestUpdate: signedUpdate }, commitment: signed };
  }

  // Get the fields for the transfer record
  // let initialState: TransferState | undefined;
  // let commitment: TransferCommitmentData | undefined;
  // let resolver: TransferResolver | undefined;
  // let meta: any;
  let transferDetails: FullTransferState | undefined;
  if (update.type === UpdateType.create) {
    const {
      merkleProofData,
      transferDefinition,
      transferEncodings,
      transferId,
      transferInitialState,
      transferTimeout,
      meta,
    } = (update as ChannelUpdate<typeof UpdateType.create>).details;
    const commitment: TransferCommitmentData = {
      state: {
        initialBalance: transferInitialState.balance,
        assetId: update.assetId,
        channelAddress: update.channelAddress,
        transferId,
        transferTimeout,
        transferDefinition,
        initialStateHash: hashTransferState(transferInitialState, transferEncodings[0]),
      },
      channelFactoryAddress: newState.networkContext.channelFactoryAddress,
      chainId: newState.networkContext.chainId,
      merkleProofData,
    };
    transferDetails = {
      transferEncodings,
      transferState: transferInitialState,
      meta,
      ...commitment.state,
      channelFactoryAddress: commitment.channelFactoryAddress,
      chainId: commitment.chainId,
    };
  }

  if (update.type === UpdateType.resolve) {
    if (!transfer) {
      throw new Error("Transfer not found");
    }
    const {
      initialBalance,
      assetId,
      transferDefinition,
      transferTimeout,
      initialStateHash,
      channelFactoryAddress,
      channelAddress,
      chainId,
      transferEncodings,
      transferState,
    } = transfer;
    const { transferResolver, meta } = (update as ChannelUpdate<typeof UpdateType.resolve>).details;
    transferDetails = {
      transferResolver: transferResolver,
      meta,
      initialBalance,
      transferId,
      assetId,
      channelAddress,
      transferDefinition,
      transferTimeout,
      initialStateHash,
      channelFactoryAddress,
      chainId,
      transferEncodings,
      transferState,
    };
  }

  return { channel: { ...newState, latestUpdate: signedUpdate }, commitment: signed, updatedTransfer: transferDetails };
};
