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
  ResolveUpdateDetails,
  CreateUpdateDetails,
} from "@connext/vector-types";
import { getSignerAddressFromPublicIdentifier, hashTransferState } from "@connext/vector-utils";
import { constants } from "ethers";
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
  channelFromStore: FullChannelState<any>,
  storeService: IVectorStore,
  messagingService: IMessagingService,
  signer: IChannelSigner,
  logger: pino.BaseLogger = pino(),
): Promise<Result<FullChannelState, ChannelUpdateError>> {
  logger.info({ method: "outbound", to: update.toIdentifier, type: update.type }, "Sending protocol message");
  // send and wait for response
  const result = await messagingService.sendProtocolMessage(update, channelFromStore?.latestUpdate);

  if (result.isError) {
    logger.error({ method: "outbound", error: result.getError()! }, "Error receiving response, will not save state!");
    return Result.fail(result.getError()!);
  }

  logger.info({ method: "outbound", to: update.toIdentifier, type: update.type }, "Received protocol response");

  const channelUpdateFromCounterparty = result.getValue();

  // get transfer state if needed
  let transfer: FullTransferState | undefined;
  if (update.type === UpdateType.resolve) {
    transfer = await storeService.getTransferState((update.details as ResolveUpdateDetails).transferId);
    if (!transfer) {
      return Result.fail(new ChannelUpdateError(ChannelUpdateError.reasons.TransferNotFound));
    }
    transfer.transferResolver = (update.details as ResolveUpdateDetails).transferResolver;
  }

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
      adjudicatorAddress: channelFromStore.networkContext.adjudicatorAddress,
      chainId: channelFromStore.networkContext.chainId,
      meta: details.meta,
    };
  }

  // verify sigs on update
  if (channelUpdateFromCounterparty.update.signatures.find((sig) => !sig)) {
    const error = new ChannelUpdateError(ChannelUpdateError.reasons.BadSignatures);
    logger.error({ method: "outbound", error: error.message }, "Error receiving response, will not save state!");
    return Result.fail(error);
  }

  try {
    await storeService.saveChannelState(
      { ...channelFromStore, latestUpdate: channelUpdateFromCounterparty.update },
      {
        adjudicatorAddress: channelFromStore.networkContext.adjudicatorAddress,
        state: channelFromStore,
        chainId: channelFromStore.networkContext.chainId,
        signatures: channelUpdateFromCounterparty.update.signatures,
      },
      transfer,
    );
    return Result.ok({ ...channelFromStore, latestUpdate: channelUpdateFromCounterparty.update });
  } catch (e) {
    return Result.fail(
      new ChannelUpdateError(
        ChannelUpdateError.reasons.SaveChannelFailed,
        channelUpdateFromCounterparty.update,
        { ...channelFromStore, latestUpdate: channelUpdateFromCounterparty.update },
        {
          error: e.message,
        },
      ),
    );
  }

  // // eliminate error cases
  // const channelError = validationRes.getError()!;
  // logger.warn(
  //   { method: "outbound", error: "channelError.message", to: update.toIdentifier, type: update.type },
  //   "Error on received message",
  // );

  // // The only error we should handle and retry is the case where we
  // // are one state behind
  // if (channelError.message !== ChannelUpdateError.reasons.StaleUpdateNonce) {
  //   return Result.fail(new ChannelUpdateError(channelError.message, update, storedChannel));
  // }

  // // We know we are out of sync with our counterparty, but we do not
  // // know by how many updates. Only in the case where our proposed
  // // update nonce == their latest update nonce

  // // Make sure the update exists
  // if (!channelError.state?.latestUpdate) {
  //   return Result.fail(
  //     new ChannelUpdateError(ChannelUpdateError.reasons.StaleChannelNonceNoUpdate, update, storedChannel),
  //   );
  // }

  // // Make sure the update is the correct one
  // if (channelError.state.latestUpdate.nonce !== update.nonce) {
  //   return Result.fail(
  //     new ChannelUpdateError(ChannelUpdateError.reasons.StaleChannelNonce, update, storedChannel, {
  //       counterpartyLatestUpdate: channelError.state.latestUpdate,
  //     }),
  //   );
  // }

  // // Apply the update, and retry the update
  // const mergeRes = await mergeUpdate(channelError.state.latestUpdate, storedChannel!, transfer);
  // if (mergeRes.isError) {
  //   return Result.fail(
  //     new ChannelUpdateError(
  //       ChannelUpdateError.reasons.ApplyUpdateFailed,
  //       channelError.state.latestUpdate,
  //       storedChannel,
  //     ),
  //   );
  // }

  // let newState = mergeRes.getValue();

  // // Save the updated state before retrying the update
  // try {
  //   // sign
  //   const res = await signData(newState, channelError.state.latestUpdate, signer, transfer);
  //   // save
  //   await storeService.saveChannelState(res.channel, res.commitment, res.updatedTransfer);
  //   newState = res.channel;
  // } catch (e) {
  //   return Result.fail(
  //     new ChannelUpdateError(
  //       ChannelUpdateError.reasons.SaveChannelFailed,
  //       channelError.state.latestUpdate,
  //       storedChannel,
  //     ),
  //   );
  // }

  // // TODO: FIX RETRY
  // // Retry the update and save
  // const syncedResult = await messagingService.sendProtocolMessage(
  //   { ...update, nonce: update.nonce + 1 },
  //   channelError.state.latestUpdate,
  // );
  // const channelUpdate2 = syncedResult.getValue();
  // const validationRes2 = await validateIncomingChannelUpdate(
  //   channelUpdate2.update,
  //   channelUpdate2.previousUpdate,
  //   newState,
  //   transfer,
  // );
  // return validationRes2;
}

export async function inbound(
  update: ChannelUpdate<any>,
  previousUpdate: ChannelUpdate<any>,
  inbox: string,
  storeService: IVectorStore,
  messagingService: IMessagingService,
  signer: IChannelSigner,
  logger: pino.BaseLogger,
): Promise<Result<FullChannelState, ChannelUpdateError>> {
  let channelFromStore = await storeService.getChannelState(update.channelAddress);
  if (!channelFromStore) {
    if (update.type !== UpdateType.setup) {
      return Result.fail(new ChannelUpdateError(ChannelUpdateError.reasons.ChannelNotFound, update));
    }

    channelFromStore = {
      channelAddress: update.channelAddress,
      participants: [
        getSignerAddressFromPublicIdentifier(update.fromIdentifier),
        getSignerAddressFromPublicIdentifier(update.toIdentifier),
      ],
      networkContext: (update.details as SetupUpdateDetails).networkContext,
      assetIds: [],
      balances: [],
      lockedBalance: [],
      merkleRoot: constants.HashZero,
      nonce: 0,
      publicIdentifiers: [update.fromIdentifier, update.toIdentifier],
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
      adjudicatorAddress: channelFromStore.networkContext.adjudicatorAddress,
      chainId: channelFromStore.networkContext.chainId,
      meta: details.meta,
    };
  }

  if (update.type === UpdateType.resolve) {
    transfer = await storeService.getTransferState((update.details as ResolveUpdateDetails).transferId);
    if (!transfer) {
      return Result.fail(new ChannelUpdateError(ChannelUpdateError.reasons.TransferNotFound));
    }
    transfer.transferResolver = (update.details as ResolveUpdateDetails).transferResolver;
  }

  // validate and merge
  // TODO: is this the correct inbound validation?
  const inboundRes = await validateIncomingChannelUpdate(update, previousUpdate, channelFromStore, transfer);
  if (inboundRes.isError) {
    logger.error(
      { method: "inbound", channel: update.channelAddress, error: inboundRes.getError()?.message },
      "Error validating incoming channel update",
    );
    messagingService.respondWithProtocolError(
      update.fromIdentifier,
      update.toIdentifier,
      inbox,
      inboundRes.getError()!,
    );
    return inboundRes;
  }
  const updatedChannelState = inboundRes.getValue();

  // sign update
  const signed = await signData(updatedChannelState, update, signer, transfer);
  // save channel
  await storeService.saveChannelState(signed.channel, signed.commitment, transfer);

  // send to counterparty
  await messagingService.respondToProtocolMessage(
    signer.publicIdentifier,
    signed.channel.latestUpdate,
    inbox,
    channelFromStore.latestUpdate,
  );
  return inboundRes;
}

// This function is responsible for handling any inbound state requests.
export async function validateIncomingChannelUpdate(
  requestedUpdate: ChannelUpdate<any>,
  counterpartyLatestUpdate: ChannelUpdate<any>,
  myState: FullChannelState,
  transfer?: FullTransferState,
): Promise<Result<FullChannelState, ChannelUpdateError>> {
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
  const diff = requestedUpdate.nonce - myState.nonce;

  // If we are ahead, or even, do not process update
  if (diff <= 0) {
    // NOTE: when you are out of sync as a protocol initiator, you will
    // use the information from this error to sync, then retry your update

    // FIXME: We don't need to pass everything over the wire here, fix that
    return Result.fail(
      new ChannelUpdateError(ChannelUpdateError.reasons.StaleUpdateNonce, myState.latestUpdate, myState, {
        requestedUpdate,
      }),
    );
  }

  // If we are behind by more than 3, we cannot sync from their latest
  // update, and must use restore
  if (diff >= 3) {
    return Result.fail(
      new ChannelUpdateError(ChannelUpdateError.reasons.StaleChannelNonce, requestedUpdate, myState, {
        counterpartyLatestUpdate,
      }),
    );
  }

  // If the update nonce is ahead of the store nonce by 2, we are
  // behind by one update. We can progress the state to the correct
  // state to be updated by applying the counterparty's supplied
  // latest action
  let previousState = myState;
  if (diff === 2) {
    // Create the proper state to play the update on top of using the
    // latest update
    if (!counterpartyLatestUpdate) {
      return Result.fail(
        new ChannelUpdateError(
          ChannelUpdateError.reasons.StaleChannelNonceNoUpdate,
          counterpartyLatestUpdate,
          myState,
          { requestedUpdate },
        ),
      );
    }
    const mergeRes = await mergeUpdate(counterpartyLatestUpdate, myState, transfer);
    if (mergeRes.isError) {
      return Result.fail(
        new ChannelUpdateError(ChannelUpdateError.reasons.ApplyUpdateFailed, counterpartyLatestUpdate, myState, {
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
  const mergeRes = await mergeUpdate(requestedUpdate, previousState, transfer);
  if (mergeRes.isError) {
    return Result.fail(
      new ChannelUpdateError(ChannelUpdateError.reasons.ApplyUpdateFailed, requestedUpdate, previousState, {
        counterpartyLatestUpdate,
        error: mergeRes.getError()!.message,
      }),
    );
  }
  const response = mergeRes.getValue()!;
  return Result.ok(response);
}

const mergeUpdate = async (
  update: ChannelUpdate<any>,
  state: FullChannelState,
  transfer?: FullTransferState,
): Promise<Result<FullChannelState, ChannelUpdateError>> => {
  await validateUpdate(update, state);
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

  return { channel: { ...newState, latestUpdate: signedUpdate }, commitment: signed, updatedTransfer: transferDetails };
};
