import {
  ChannelUpdate,
  IVectorStore,
  UpdateType,
  IMessagingService,
  SetupUpdateDetails,
  FullChannelState,
  IChannelSigner,
  ChannelUpdateError,
  Result,
  ChannelCommitmentData,
  FullTransferState,
  TransferCommitmentData,
} from "@connext/vector-types";
import { hashTransferState } from "@connext/vector-utils";
import { BigNumber, constants } from "ethers";
import pino from "pino";

import { generateSignedChannelCommitment } from "./utils";
import { applyUpdate } from "./update";
import { validateUpdate } from "./validate";

// Function responsible for handling user-initated/outbound channel updates.
// These updates will be single signed, the function should dispatch the
// message to the counterparty, and resolve once the updated channel state
// has been persisted.
export async function outbound(
  update: ChannelUpdate<any>,
  storedChannel: FullChannelState<any> | undefined,
  storeService: IVectorStore,
  messagingService: IMessagingService,
  signer: IChannelSigner,
  logger: pino.BaseLogger = pino(),
): Promise<Result<FullChannelState, ChannelUpdateError>> {
  // NOTE: This is checked in `generateUpdate` as well, so this is unnecessary
  // but allows us to not have to force unwrap
  if (!storedChannel && update.type !== UpdateType.setup) {
    return Result.fail(new ChannelUpdateError(ChannelUpdateError.reasons.ChannelNotFound, update));
  }

  logger.info({ method: "outbound", to: update.toIdentifier, type: update.type }, "Sending protocol message");
  const result = await messagingService.sendProtocolMessage(update, storedChannel?.latestUpdate);

  if (result.isError) {
    logger.error({ method: "outbound", error: result.getError()! }, "Error receiving response!");
    return Result.fail(result.getError()!);
  }

  logger.info({ method: "outbound", to: update.toIdentifier, type: update.type }, "Received protocol response");

  const channelUpdate = result.getValue();
  const validationRes = await validateAndSaveIncomingChannelUpdate(
    channelUpdate.update,
    channelUpdate.previousUpdate,
    storeService,
    signer,
    logger,
  );
  if (!validationRes.isError) {
    // No error returned, successfully updated state
    return Result.ok(validationRes.getValue());
  }

  // eliminate error cases
  const channelError = validationRes.getError()!;
  logger.warn(
    { method: "outbound", error: "channelError.message", to: update.toIdentifier, type: update.type },
    "Error on received message",
  );

  // The only error we should handle and retry is the case where we
  // are one state behind
  if (channelError.message !== ChannelUpdateError.reasons.StaleUpdateNonce) {
    return Result.fail(new ChannelUpdateError(channelError.message, update, storedChannel));
  }

  // We know we are out of sync with our counterparty, but we do not
  // know by how many updates. Only in the case where our proposed
  // update nonce == their latest update nonce

  // Make sure the update exists
  if (!channelError.state?.latestUpdate) {
    return Result.fail(
      new ChannelUpdateError(ChannelUpdateError.reasons.StaleChannelNonceNoUpdate, update, storedChannel),
    );
  }

  // Make sure the update is the correct one
  if (channelError.state.latestUpdate.nonce !== update.nonce) {
    return Result.fail(
      new ChannelUpdateError(ChannelUpdateError.reasons.StaleChannelNonce, update, storedChannel, {
        counterpartyLatestUpdate: channelError.state.latestUpdate,
      }),
    );
  }

  // Apply the update, and retry the update
  const mergeRes = await mergeUpdate(channelError.state.latestUpdate, storedChannel!, storeService);
  if (mergeRes.isError) {
    return Result.fail(
      new ChannelUpdateError(
        ChannelUpdateError.reasons.ApplyUpdateFailed,
        channelError.state.latestUpdate,
        storedChannel,
      ),
    );
  }

  const newState = mergeRes.getValue();

  // Save the updated state before retrying the update
  try {
    await signAndSaveData(newState, channelError.state.latestUpdate, signer, storeService);
  } catch (e) {
    return Result.fail(
      new ChannelUpdateError(
        ChannelUpdateError.reasons.SaveChannelFailed,
        channelError.state.latestUpdate,
        storedChannel,
      ),
    );
  }

  // Retry the update and save
  const syncedResult = await messagingService.sendProtocolMessage(
    { ...update, nonce: update.nonce + 1 },
    channelError.state.latestUpdate,
  );
  const channelUpdate2 = syncedResult.getValue();
  const validationRes2 = await validateAndSaveIncomingChannelUpdate(
    channelUpdate2.update,
    channelUpdate2.previousUpdate,
    storeService,
    signer,
    logger,
  );
  return validationRes2;
}

export async function inbound(
  update: ChannelUpdate<any>,
  previousUpdate: ChannelUpdate<any>,
  inbox: string,
  storeService: IVectorStore,
  messagingService: IMessagingService,
  signer: IChannelSigner,
  logger: pino.BaseLogger = pino(),
): Promise<Result<FullChannelState, ChannelUpdateError>> {
  const channelFromStore = await storeService.getChannelState(update.channelAddress);
  if (!channelFromStore) {
    return Result.fail(new ChannelUpdateError(ChannelUpdateError.reasons.ChannelNotFound));
  }
  const inboundRes = await validateAndSaveIncomingChannelUpdate(update, previousUpdate, storeService, signer, logger);
  if (inboundRes.isError) {
    messagingService.respondWithProtocolError(
      update.fromIdentifier,
      update.toIdentifier,
      inbox,
      inboundRes.getError()!,
    );
    return inboundRes;
  }
  const updatedChannelState = inboundRes.getValue();

  // send to counterparty
  await messagingService.respondToProtocolMessage(
    updatedChannelState.latestUpdate,
    inbox,
    channelFromStore.latestUpdate,
  );
  return inboundRes;
}

// This function is responsible for handling any inbound state requests.
export async function validateAndSaveIncomingChannelUpdate(
  requestedUpdate: ChannelUpdate<any>,
  counterpartyLatestUpdate: ChannelUpdate<any>,
  storeService: IVectorStore,
  signer: IChannelSigner,
  logger: pino.BaseLogger,
): Promise<Result<FullChannelState, ChannelUpdateError>> {
  // Get our latest stored state + active transfers
  let storedState = await storeService.getChannelState(requestedUpdate.channelAddress);
  if (!storedState) {
    // NOTE: the creation update MUST have a nonce of 1 not 0!
    // You may not be able to find a channel state IFF the channel is
    // being created for the first time. If this is the case, create an
    // empty channel and continue through the function
    if (requestedUpdate.type !== UpdateType.setup) {
      return Result.fail(
        new ChannelUpdateError(ChannelUpdateError.reasons.ChannelNotFound, requestedUpdate, storedState),
      );
    }
    requestedUpdate.details as SetupUpdateDetails;
    // Create an empty channel state
    storedState = {
      channelAddress: requestedUpdate.channelAddress,
      participants: [requestedUpdate.fromIdentifier, signer.publicIdentifier],
      networkContext: (requestedUpdate.details as SetupUpdateDetails).networkContext,
      assetIds: [],
      balances: [],
      lockedBalance: [],
      merkleRoot: constants.HashZero,
      nonce: 0,
      publicIdentifiers: [requestedUpdate.fromIdentifier, signer.publicIdentifier],
      timeout: (requestedUpdate.details as SetupUpdateDetails).timeout,
      latestUpdate: {} as any, // There is no latest update on setup
      latestDepositNonce: 0,
    };
  }

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
  // TODO: should also make sure that there are *2* signatures
  // await counterpartyLatestUpdate.commitment.assertSignatures();

  // Get the difference between the stored and received nonces
  const diff = BigNumber.from(requestedUpdate.nonce).sub(storedState.nonce);

  // If we are ahead, or even, do not process update
  if (diff.lte(0)) {
    // NOTE: when you are out of sync as a protocol initiator, you will
    // use the information from this error to sync, then retry your update

    // FIXME: We don't need to pass everything over the wire here, fix that
    return Result.fail(
      new ChannelUpdateError(ChannelUpdateError.reasons.StaleUpdateNonce, storedState.latestUpdate, storedState, {
        requestedUpdate,
      }),
    );
  }

  // If we are behind by more than 3, we cannot sync from their latest
  // update, and must use restore
  if (diff.gte(3)) {
    return Result.fail(
      new ChannelUpdateError(ChannelUpdateError.reasons.StaleChannelNonce, requestedUpdate, storedState, {
        counterpartyLatestUpdate,
      }),
    );
  }

  // If the update nonce is ahead of the store nonce by 2, we are
  // behind by one update. We can progress the state to the correct
  // state to be updated by applying the counterparty's supplied
  // latest action
  let previousState = storedState;
  if (diff.eq(2)) {
    // Create the proper state to play the update on top of using the
    // latest update
    if (!counterpartyLatestUpdate) {
      return Result.fail(
        new ChannelUpdateError(
          ChannelUpdateError.reasons.StaleChannelNonceNoUpdate,
          counterpartyLatestUpdate,
          storedState,
          { requestedUpdate },
        ),
      );
    }
    const mergeRes = await mergeUpdate(counterpartyLatestUpdate, storedState, storeService);
    if (mergeRes.isError) {
      return Result.fail(
        new ChannelUpdateError(ChannelUpdateError.reasons.ApplyUpdateFailed, counterpartyLatestUpdate, storedState, {
          requestedUpdate,
          error: mergeRes.getError()!.message,
          stack: mergeRes.getError()!.stack,
        }),
      );
    }
    previousState = mergeRes.getValue();
  }

  // We now have the latest state for the update, and should be
  // able to play it on top of the update
  const mergeRes = await mergeUpdate(requestedUpdate, previousState, storeService);
  if (mergeRes.isError) {
    return Result.fail(
      new ChannelUpdateError(ChannelUpdateError.reasons.ApplyUpdateFailed, requestedUpdate, previousState, {
        counterpartyLatestUpdate,
        error: mergeRes.getError()!.message,
      }),
    );
  }
  const response = mergeRes.getValue()!;

  // Otherwise, we are receiving an ack, and we should save the
  // update to store and post to the EVT
  try {
    await signAndSaveData(response, requestedUpdate, signer, storeService);
  } catch (e) {
    return Result.fail(
      new ChannelUpdateError(ChannelUpdateError.reasons.SaveChannelFailed, requestedUpdate, previousState, {
        error: e.message,
      }),
    );
  }
  return Result.ok(response);
}

const mergeUpdate = async (
  update: ChannelUpdate<any>,
  state: FullChannelState,
  storeService: IVectorStore,
): Promise<Result<FullChannelState, ChannelUpdateError>> => {
  await validateUpdate(update, state, storeService);
  const result = await applyUpdate(update, state, storeService);
  return result;
};

const signAndSaveData = async (
  newState: FullChannelState,
  update: ChannelUpdate<any>, // Should be single- or un-signed
  signer: IChannelSigner,
  store: IVectorStore,
): Promise<ChannelCommitmentData> => {
  const signed = await generateSignedChannelCommitment(newState, signer, update.signatures);

  const transferId =
    update.type === UpdateType.create || update.type === UpdateType.resolve ? update.details.transferId : undefined;

  const signedUpdate = { ...update, signatures: signed.signatures };

  if (!transferId) {
    // Not a transfer update, no need to include transfer
    // record details
    await store.saveChannelState({ ...newState, latestUpdate: signedUpdate }, signed);
    return signed;
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
      adjudicatorAddress: newState.networkContext.adjudicatorAddress,
      chainId: newState.networkContext.chainId,
      merkleProofData,
    };
    transferDetails = {
      transferEncodings,
      transferState: transferInitialState,
      meta,
      ...commitment.state,
      adjudicatorAddress: commitment.adjudicatorAddress,
      chainId: commitment.chainId,
    };
  }

  if (update.type === UpdateType.resolve) {
    const transfer = await store.getTransferState(transferId);
    if (!transfer) {
      throw new Error("Transfer not found");
    }
    const {
      initialBalance,
      assetId,
      transferDefinition,
      transferTimeout,
      initialStateHash,
      adjudicatorAddress,
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
      adjudicatorAddress,
      chainId,
      transferEncodings,
      transferState,
    };
  }

  await store.saveChannelState({ ...newState, latestUpdate: signedUpdate }, signed, transferDetails);

  return signed;
};
