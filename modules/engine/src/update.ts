import { UpdateParams, ChannelUpdate, UpdateType, ChannelState } from "./types";

<<<<<<< HEAD:modules/engine/src/update.ts
// eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
export async function generateUpdate(params: UpdateParams, storeService: any): Promise<ChannelUpdate> {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const state = await storeService.getChannelState();

    switch (params.type) {
        case UpdateType.setup: { //TODO, do we actually need setup?
          return generateSetupUpdate(0 as any);
=======
export async function generateUpdate(params: UpdateParams, storeService, onchainService): Promise<ChannelUpdate> {
    const state: ChannelState = await storeService.getChannelState();
    let update: ChannelUpdate;

    switch (params.type) {
        case UpdateType.setup: {

>>>>>>> master:modules/engine/update.ts
        }

        case UpdateType.deposit: {

        }

        case UpdateType.create: {

        }

        case UpdateType.resolve: {

        }
        // Is there a case where updateType isn't one of these? I guess we can validate incoming params elsewhere
    }

    // Lastly, do the things that are constant to every update
    update.nonce = state.nonce + 1;
    update.channelId = state.channelId;
    update.type = params.type;
    update.counterpartyPublicIdentifier = this.counterpartyPublicIdentifier;

    return update;
}

<<<<<<< HEAD:modules/engine/src/update.ts
// eslint-disable-next-line @typescript-eslint/no-unused-vars
async function generateSetupUpdate(state: ChannelState): Promise<ChannelUpdate> {

    return {
        counterpartyPublicIdentifier: "", //TODO
        nonce: "0",
        type: "create",
    } as any;
}
=======
async function generateDepositUpdate(state: ChannelState, update: Partial<ChannelUpdate>, onchainService): Promise<ChannelUpdate> {
    /*
    The update initiator's balance must be incremented by the deposit amount (calculating new balances for each party using onchain data as described in the Funding a Channel writeup). Note that this is per-assetId, so a new assetId may need to be added to the assetId array.
    The channel nonce must be updated by 1.
    The latestDepositNonce in state must be set to whatever is onchain for Alice.
    A new ChannelCommitment must be generated using the above and signed by both parties.
    Set this update to state.latestUpdate.
    */

    // 1. Figure out

}
>>>>>>> master:modules/engine/update.ts
