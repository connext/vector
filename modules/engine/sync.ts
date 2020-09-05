import { ChannelUpdate, ChannelState } from "./types";
import {validate} from "./validate";

export async function outbound(update: ChannelUpdate, messagingService) {
    try {
        // Todo turn `update` into a DTO before sending?
        messagingService.send(update.counterpartyPublicIdentifier, update)
    }
    // Todo retry on a timer (up to a limit) while the new channel state nonce is not equal to update nonce
}

export async function inbound(update: ChannelUpdate, storeService) {
    // 1. Get the latest ChannelState.
    const state = await storeService.getChannelState();
    // 2. Compare latest nonce to update nonce
        // a. Update nonce == latest nonce + 1
            // is this an ack or a new update? How can we know?
            // If it contains two signtures, then you should validate both sigs and then merge (includes case where you're behind)
            // If it contains one signature, then you should validate one sig, sign, merge, then return ack
        // b. Update nonce == latest nonce
            // is this an ack or a duplicate?
            // If it contains two signatures, then 

    await validate(update, state);
    // TODO sign it?
    const newState = await mergeUpdate(update, state);
    await storeService.updateChannelState(newState)

    // TODO If the update needs to be acked, do it here
}

async function mergeUpdate(update: ChannelUpdate, state: ChannelState) {
    // TODO should this just exist in the store?
}