import {
  ChannelUpdate,
  IVectorStore,
  UpdateType,
  IMessagingService,
  ChainProviders,
  SetupUpdateDetails,
  FullChannelState,
  IChannelSigner,
  ChannelUpdateError,
  Result,
  VectorMessage,
  VectorChannelMessage,
  VectorErrorMessage,
  ChannelCommitmentData,
} from "@connext/vector-types";
import { delay, getTransferNameFromState, hashTransferState } from "@connext/vector-utils";
import { BigNumber, constants } from "ethers";
import { Evt } from "evt";
import Pino from "pino";

import { isChannelMessage, isChannelState, isErrorMessage, generateSignedChannelCommitment } from "./utils";
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
  chainProviders: ChainProviders,
  stateEvt: Evt<FullChannelState>,
  errorEvt: Evt<ChannelUpdateError>,
  logger: Pino.BaseLogger = Pino(),
): Promise<Result<FullChannelState, ChannelUpdateError>> {
  // NOTE: This is checked in `generateUpdate` as well, so this is unnecessary
  // but allows us to not have to force unwrap
  if (!storedChannel && update.type !== UpdateType.setup) {
    return Result.fail(new ChannelUpdateError(ChannelUpdateError.reasons.ChannelNotFound, update));
  }

  // Create a helper function that will create a function that properly
  // sets up the promise handlers. The only time this promise should
  // reject instead of resolve is if *sending* the message failed. In
  // that case, this should be safe to retry on failure
  const generatePromise = (updateToSend: ChannelUpdate<any>, prevUpdate: ChannelUpdate<any> | undefined) =>
    new Promise<Result<FullChannelState, ChannelUpdateError>>((resolve) => {
      // If there is an error event corresponding to this channel and
      // this nonce, reject the promise
      errorEvt
        .pipe((e: ChannelUpdateError) => {
          return e.update?.channelAddress === updateToSend.channelAddress;
        })
        .attachOnce((e: ChannelUpdateError) => resolve(Result.fail(e)));

      // If there is a channel update event corresponding to
      // this channel update, resolve the promise
      stateEvt
        .pipe((e: FullChannelState) => {
          return e.channelAddress === updateToSend.channelAddress;
        })
        .attachOnce((state: FullChannelState) => resolve(Result.ok(state)));

      messagingService
        .send(updateToSend.toIdentifier, {
          to: updateToSend.toIdentifier,
          from: updateToSend.fromIdentifier,
          data: { update: updateToSend, latestUpdate: prevUpdate },
        })
        .catch((e) =>
          resolve(
            Result.fail(
              new ChannelUpdateError(ChannelUpdateError.reasons.MessageFailed, updateToSend, storedChannel, {
                error: e.message,
              }),
            ),
          ),
        );
    });

  // Retry sending the message 5 times w/3s delay
  const sendWithRetry = async (
    updateToSend: ChannelUpdate<any>,
    prevUpdate: ChannelUpdate<any> | undefined,
  ): Promise<Result<FullChannelState<any>, ChannelUpdateError>> => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    for (const _ of Array(5).fill(0)) {
      const result = await generatePromise(updateToSend, prevUpdate);
      if (!result.isError) {
        logger.info({ method: "sendWithRetry", step: "Got result", result: result.getValue() });
        return result;
      }
      const channelError = result.getError()!;
      // The only errors we should retry here is if the message failed
      // to send
      if (channelError.message !== ChannelUpdateError.reasons.MessageFailed) {
        return Result.fail(new ChannelUpdateError(channelError.message, channelError.update, channelError.state));
      }
      logger.error(`Failed to execute helper`, { error: result.getError()?.message, stack: result.getError()?.stack });
      await delay(3_000);
    }

    return Result.fail(new ChannelUpdateError(ChannelUpdateError.reasons.MessageFailed, updateToSend, storedChannel));
  };

  const result = await sendWithRetry(update, storedChannel?.latestUpdate);
  if (!result.isError && isChannelState(result.getValue())) {
    // No error returned, successfully updated state
    return Result.ok(result.getValue());
  }

  const channelError = result.getError()!;

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
  const mergeRes = await mergeUpdate(
    channelError.state.latestUpdate,
    storedChannel!,
    storeService,
    chainProviders[storedChannel!.networkContext.chainId],
  );
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

  // Retry the update
  const syncedResult = await sendWithRetry({ ...update, nonce: update.nonce + 1 }, channelError.state.latestUpdate);
  return syncedResult;
}

// This function is responsible for handling any inbound vector messages.
// This function is expected to handle errors and updates from a counterparty.
export async function inbound(
  message: VectorMessage,
  storeService: IVectorStore,
  messagingService: IMessagingService,
  signer: IChannelSigner,
  chainProviders: ChainProviders,
  stateEvt: Evt<FullChannelState>,
  errorEvt: Evt<ChannelUpdateError>,
  logger: Pino.BaseLogger = Pino(),
): Promise<Result<FullChannelState | undefined, ChannelUpdateError>> {
  // If the message is from us, ignore
  if (message.from === signer.publicIdentifier) {
    return Result.ok(undefined);
  }

  // If it is a response, process the response
  if (isChannelMessage(message)) {
    logger.info({ method: "inbound", step: "Detected channel message" });
    return processChannelMessage(
      message as VectorChannelMessage,
      storeService,
      messagingService,
      signer,
      chainProviders,
      stateEvt,
      errorEvt,
      logger,
    );
  } else if (isErrorMessage(message)) {
    // It is an error message from a counterparty. An `outbound` promise
    // may be waiting to resolve, so post to the errorEvt
    logger.warn({ method: "inbound", step: "Detected error message" });
    const errorMessage = message as VectorErrorMessage;
    errorEvt.post(errorMessage.error);
    return Result.fail(new ChannelUpdateError(errorMessage.error.message, errorMessage.error.update));
  }

  logger.info({ method: "inbound", step: "Unrecognized message" });
  // Otherwise, it is an unrecognized message format. do nothing
  return Result.ok(undefined);
}

// This function is responsible for handling any inbound state requests.
async function processChannelMessage(
  message: VectorChannelMessage,
  storeService: IVectorStore,
  messagingService: IMessagingService,
  signer: IChannelSigner,
  chainProviders: ChainProviders,
  stateEvt: Evt<FullChannelState>,
  errorEvt: Evt<ChannelUpdateError>,
  logger: Pino.BaseLogger = Pino(),
): Promise<Result<FullChannelState, ChannelUpdateError>> {
  const { from, data } = message;
  const requestedUpdate = data.update as ChannelUpdate<any>;
  const counterpartyLatestUpdate = data.latestUpdate as ChannelUpdate<any>;
  // Create helper to handle errors
  const handleError = async (error: ChannelUpdateError): Promise<ChannelUpdateError> => {
    // If the update is single signed, the counterparty is waiting
    // for a response.
    if (requestedUpdate.signatures.length === 1) {
      await messagingService.publish(from, { to: from, from: signer.publicIdentifier, error });
    }
    // Post to the evt
    errorEvt.post(error);
    // If the update is double signed, the counterparty is not
    // waiting for a response and it is safe to error
    return error;
  };

  // Get our latest stored state + active transfers
  let storedState = await storeService.getChannelState(requestedUpdate.channelAddress);
  if (!storedState) {
    // NOTE: the creation update MUST have a nonce of 1 not 0!
    // You may not be able to find a channel state IFF the channel is
    // being created for the first time. If this is the case, create an
    // empty channel and continue through the function
    if (requestedUpdate.type !== UpdateType.setup) {
      const error = await handleError(
        new ChannelUpdateError(ChannelUpdateError.reasons.ChannelNotFound, requestedUpdate, storedState),
      );
      return Result.fail(error);
    }
    requestedUpdate.details as SetupUpdateDetails;
    // Create an empty channel state
    storedState = {
      channelAddress: requestedUpdate.channelAddress,
      participants: [requestedUpdate.fromIdentifier, signer.publicIdentifier],
      networkContext: (requestedUpdate.details as SetupUpdateDetails).networkContext,
      assetIds: [],
      balances: [],
      lockedValue: [],
      merkleRoot: constants.HashZero,
      nonce: 0,
      publicIdentifiers: [requestedUpdate.fromIdentifier, signer.publicIdentifier],
      timeout: (requestedUpdate.details as SetupUpdateDetails).timeout,
      latestUpdate: {} as any, // There is no latest update on setup
      latestDepositNonce: 0,
    };
  }

  const providerUrl = chainProviders[storedState.networkContext.chainId];

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
    const error = await handleError(
      new ChannelUpdateError(ChannelUpdateError.reasons.StaleUpdateNonce, storedState.latestUpdate, storedState, {
        requestedUpdate,
      }),
    );
    return Result.fail(error);
  }

  // If we are behind by more than 3, we cannot sync from their latest
  // update, and must use restore
  if (diff.gte(3)) {
    const error = await handleError(
      new ChannelUpdateError(ChannelUpdateError.reasons.StaleChannelNonce, requestedUpdate, storedState, {
        counterpartyLatestUpdate,
      }),
    );
    return Result.fail(error);
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
      const error = await handleError(
        new ChannelUpdateError(
          ChannelUpdateError.reasons.StaleChannelNonceNoUpdate,
          counterpartyLatestUpdate,
          storedState,
          { requestedUpdate },
        ),
      );
      return Result.fail(error);
    }
    const mergeRes = await mergeUpdate(counterpartyLatestUpdate, storedState, storeService, providerUrl);
    if (mergeRes.isError) {
      const error = await handleError(
        new ChannelUpdateError(ChannelUpdateError.reasons.ApplyUpdateFailed, counterpartyLatestUpdate, storedState, {
          requestedUpdate,
          error: mergeRes.getError()!.message,
          stack: mergeRes.getError()!.stack,
        }),
      );
      return Result.fail(error);
    }
    previousState = mergeRes.getValue();
  }

  // We now have the latest state for the update, and should be
  // able to play it on top of the update
  const mergeRes = await mergeUpdate(requestedUpdate, previousState, storeService, providerUrl);
  if (mergeRes.isError) {
    const error = await handleError(
      new ChannelUpdateError(ChannelUpdateError.reasons.ApplyUpdateFailed, requestedUpdate, previousState, {
        counterpartyLatestUpdate,
        error: mergeRes.getError()!.message,
      }),
    );
    return Result.fail(error);
  }
  const response = mergeRes.getValue()!;

  // If the update was single signed, the counterparty is proposing
  // an update, so we should return an ack
  if (requestedUpdate.signatures.filter((x) => !!x).length === 1) {
    // Sign the update
    let signed: ChannelCommitmentData;
    try {
      signed = await signAndSaveData(response, requestedUpdate, signer, storeService);
    } catch (e) {
      const error = await handleError(
        new ChannelUpdateError(ChannelUpdateError.reasons.SaveChannelFailed, requestedUpdate, previousState, {
          error: e.message,
        }),
      );
      return Result.fail(error);
    }

    // Send the latest update to the node
    await messagingService.publish(from, {
      to: from,
      from: signer.publicIdentifier,
      data: {
        update: { ...requestedUpdate, signatures: signed.signatures },
        latestUpdate: response.latestUpdate,
      },
    });
    return Result.ok(response);
  }

  // Otherwise, we are receiving an ack, and we should save the
  // update to store and post to the EVT
  try {
    await signAndSaveData(response, requestedUpdate, signer, storeService);
  } catch (e) {
    const error = await handleError(
      new ChannelUpdateError(ChannelUpdateError.reasons.SaveChannelFailed, requestedUpdate, previousState, {
        error: e.message,
      }),
    );
    return Result.fail(error);
  }
  stateEvt.post(response);
  return Result.ok(response);
}

const mergeUpdate = async (
  update: ChannelUpdate<any>,
  state: FullChannelState,
  storeService: IVectorStore,
  providerUrl: string,
): Promise<Result<FullChannelState, ChannelUpdateError>> => {
  await validateUpdate(update, state, storeService, providerUrl);
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
    await store.saveChannelState({...newState, latestUpdate: signedUpdate }, signed);
    return signed;
  }

  // Get the fields for the transfer record
  // let initialState: TransferState | undefined;
  // let commitment: TransferCommitmentData | undefined;
  // let resolver: TransferResolver | undefined;
  // let meta: any;
  let transferDetails;
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
    const commitment = {
      state: {
        initialBalance: transferInitialState.balance,
        assetId: update.assetId,
        channelAddress: update.channelAddress,
        transferId,
        transferTimeout,
        transferEncodings,
        transferDefinition,
        initialStateHash: hashTransferState(getTransferNameFromState(transferInitialState), transferInitialState),
      },
      adjudicatorAddress: newState.networkContext.adjudicatorAddress,
      chainId: newState.networkContext.chainId,
      merkleProofData,
    };
    transferDetails = {
      initialState: transferInitialState,
      commitment,
      meta,
    };
  }

  if (update.type === UpdateType.resolve) {
    const { transferResolver, meta } = (update as ChannelUpdate<typeof UpdateType.resolve>).details;
    transferDetails = {
      resolver: transferResolver,
      meta,
    };
  }

  await store.saveChannelState({...newState, latestUpdate: signedUpdate}, signed, {
    transferId,
    ...(transferDetails ?? {}),
  });

  return signed;
};
