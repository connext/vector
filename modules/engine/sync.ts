import {BigNumber} from "ethers";
import {Evt} from "evt";
import { ChannelUpdate, ChannelState, IStoreService, IMessagingService, VectorMessage, VectorChannelMessage, VectorErrorMessage } from "./types";
import {validate} from "./validate";
import { logger, isChannelMessage } from "./utils";
import { ChannelUpdateError } from "./errors";

// Function responsible for handling user-initated/outbound channel updates.
// These updates will be single signed, the function should dispatch the 
// message to the counterparty, and resolve once the updated channel state 
// has been persisted.
export async function outbound(
  update: ChannelUpdate, 
  storeService: IStoreService,
  messagingService: IMessagingService, 
  stateEvt: Evt<ChannelState>, 
  errorEvt: Evt<ChannelUpdateError>
): Promise<ChannelState> {
  const storedChannel = await storeService.getChannelState(update.channelId);
  if (!storedChannel) {
    // TODO: what if this is creating a channel?
    throw new Error('Channel not found')
  }
  // Create a helper function that will create a function that properly
  // sets up the promise handlers
  const generatePromise = () => new Promise<ChannelState>((resolve, reject) => {
    // If there is an error event corresponding to this channel and
    // this nonce, reject the promise
    errorEvt.pipe((e: ChannelUpdateError) => {
      return e.update.nonce === update.nonce && e.update.channelId === e.update.channelId
    })
    .attachOnce((e: ChannelUpdateError) => reject(e.message))

    // If there is a channel update event corresponding to
    // this channel update, resolve the promise
    stateEvt.pipe((e: ChannelState) => {
      return e.channelId === update.channelId && e.latestNonce === update.nonce
    })
    .attachOnce((e: ChannelState) => resolve(e));

    // TODO: turn `update` into a DTO before sending?
    // TODO: what if there is no latest update?
    messagingService.send(update.counterpartyPublicIdentifier, { update, latestUpdate: storedChannel.latestUpdate }).catch(e => reject(e.message));
  });


  try {
    const newState = await generatePromise();
    return newState;
  } catch (e) {
    logger.error(`Failed to update channel: ${e.message}`, { message: e.message, update, stack: e.stack })
    // The above promise could fail for a variety of reasons:
    // - timeout
    // - out of sync
    // - channel not found
    // - invalid update
    // - etc.
    // In only ONE case should this function retry automatically: where
    // we are behind, and they have supplied a latest update for us
    // to apply to get the channels in sync (this will be the 
    // `StaleUpdateNonce` error message)
    if (!e.message.includes(ChannelUpdateError.reasons.StaleUpdateNonce)) {
      // TODO: What error message here? We may want to change the channel update
      // error constructor
      throw new Error(e.message);
    }

    // FIXME: should apply the `latestUpdate`, if possible, that is returned
    // on the error thrown by the channel counterparty and retry update
    // proposal. If the update CANNOT be directly applied, then you should
    // hard error with the need to restore
    throw new Error("FIXME: the outbound function should handle the update, bring their channel up to date, and retry the update");

    // TODO: Is this the only time you would want to retry automatically?

    // If the error is recognized and can be retried, handle that case.
  }
}

// This function is responsible for handling any inbound vector messages.
// This function is expected to handle errors and updates from a counterparty.
export async function inbound(
  message: VectorMessage, 
  storeService: IStoreService,
  messagingService: IMessagingService,
  signer: any,
  stateEvt: Evt<ChannelState>, 
  errorEvt: Evt<ChannelUpdateError>,
): Promise<void> {
  // If the message is from us, ignore
  if (message.from === signer.publicIdentifier) {
    return;
  }

  // If it is a response, process the response
  if (isChannelMessage(message)) {
    return processChannelMessage(message, storeService, messagingService, signer, stateEvt, errorEvt);
  }

  // It is an error message from a counterparty. An `outbound` promise
  // may be waiting to resolve, so post to th errorEvt
  // TODO we should not assume here that any non-channel-message is an error message(!!)
  errorEvt.post((message as VectorErrorMessage).error);
}

// This function is responsible for handling any inbound state requests.
// TODO: How should this function handle `create` messages?
// We should probably break this up into the different protocols,
// since atm this is mostly geared towards handling "updates"
async function processChannelMessage(
  message: VectorChannelMessage, 
  storeService: IStoreService,
  messagingService: IMessagingService,
  signer: any,
  stateEvt: Evt<ChannelState>,
  errorEvt: Evt<ChannelUpdateError>,
): Promise<void> {
  const { from, data } = message;
  const requestedUpdate = data.update as ChannelUpdate;
  const counterpartyLatestUpdate = data.latestUpdate as ChannelUpdate;
  // Create helper to handle errors
  const handleError = async (error: ChannelUpdateError) => {
    // If the update is single signed, the counterparty is waiting
    // for a response.
    if (requestedUpdate.commitment.signatures.length === 1) {
      await messagingService.send(from, error);
    }
    // Post to the evt
    errorEvt.post(error);
    // If the update is double signed, the counterparty is not
    // waiting for a response and it is safe to error
    throw error;
  }

  // Get our latest stored state
  const storedState: ChannelState = await storeService.getChannelState(requestedUpdate.channelId);
  if (!storedState) {
    // TODO: if this function should *also* handle channel creation methods,
    // then that is the case that should be handled here
    return handleError(new ChannelUpdateError(ChannelUpdateError.reasons.ChannelNotFound, requestedUpdate, storedState))
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
  try {
    await requestedUpdate.commitment.assertSignatures();
    // TODO: should also make sure that there are *2* signatures
    await counterpartyLatestUpdate.commitment.assertSignatures();
  } catch (e) {
    return handleError(new ChannelUpdateError(ChannelUpdateError.reasons.BadSignatures,  requestedUpdate, storedState, {counterpartyLatestUpdate, error: e.message}))
  }

  // Get the difference between the stored and received nonces
  const diff = BigNumber.from(requestedUpdate.nonce).sub(storedState.latestNonce);

  // If we are ahead, or even, do not process update
  if (diff.lte(0)) {
    // FIXME: How should the outbound handle syncs?
    return handleError(new ChannelUpdateError(ChannelUpdateError.reasons.StaleUpdateNonce, requestedUpdate, storedState, { counterpartyLatestUpdate }));
  }

  // If we are behind by more than 3, we cannot sync from their latest
  // update, and must use restore
  if (diff.gte(3)) {
    return handleError(new ChannelUpdateError(ChannelUpdateError.reasons.StaleChannelNonce, requestedUpdate, storedState, { counterpartyLatestUpdate }))
  }

  // If the update nonce is ahead of the store nonce by 2, we are
  // behind by one update. We can progress the state to the correct
  // state to be updated by applying the counterparty's supplied
  // latest action
  let previousState = storedState;
  if (diff.eq(2)) {
    // Create the proper state to play the update on top of
    try {
      // TODO: what if there is no latest update?
      previousState = await mergeUpdate(counterpartyLatestUpdate, storedState);
    } catch (e) {
      return handleError(new ChannelUpdateError(ChannelUpdateError.reasons.MergeUpdateFailed, counterpartyLatestUpdate, storedState, { requestedUpdate, error: e.message, stack: e.stack }))
    }
  }

  // We now have the latest state for the update, and should be
  // able to play it on top of the update
  let response: ChannelState | string;
  try {
    response = await mergeUpdate(requestedUpdate, previousState);
  } catch (e) {
    response = e.message;
  }
  if (typeof response === "string") {
    return handleError(new ChannelUpdateError(ChannelUpdateError.reasons.MergeUpdateFailed, requestedUpdate, previousState, { counterpartyLatestUpdate, error: response }))
  }

  // If the update was single signed, the counterparty is proposing
  // an update, so we should return an ack
  if (requestedUpdate.commitment.signatures.length === 1) {
    // Sign the update
    let signed: MultisigCommitment;
    try {
      const sig = await signer.signMessage(requestedUpdate.commitment.getHash());
      signed = requestedUpdate.commitment.addSignature(sig);
      await storeService.saveChannelState(response);
    } catch (e) {
      return handleError(new ChannelUpdateError(ChannelUpdateError.reasons.SaveChannelFailed, requestedUpdate, previousState, { error: e.message }))
    }

    // Send the latest update to the node
    await messagingService.send(from, { update: {...requestedUpdate, commitment: signed}, latestUpdate: response.latestUpdate })
    return;
  }

  // Otherwise, we are receiving an ack, and we should save the
  // update to store and post to the EVT
  try {
    await storeService.saveChannelState(response);
  } catch (e) {
    return handleError(new ChannelUpdateError(ChannelUpdateError.reasons.SaveChannelFailed, requestedUpdate, previousState, { error: e.message }))
  }
  stateEvt.post(response);
}

// Creates a new state from the given update
async function mergeUpdate(update: ChannelUpdate, state: ChannelState): Promise<ChannelState> {
  // TODO should this just exist in the store?
  await validate(update, state);
  throw new Error("Method not implemented")
}