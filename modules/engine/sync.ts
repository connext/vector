import { ChannelUpdate, ChannelState } from "./types";
import validate from "./validate";

export async function outbound(update: ChannelUpdate, messagingService) {

}

export async function inbound(update: ChannelUpdate, storeService) {
    await validate(update);
    const state = await storeService.getChannelState();
    const newState = await mergeUpdate(update, state);
    await storeService.updateChannelState(newState)
}

async function mergeUpdate(update: ChannelUpdate, state: ChannelState) {
    
}