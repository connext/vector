import { UpdateParams, ChannelUpdate, UpdateType, ChannelState } from "./types";

export async function generateUpdate(params: UpdateParams, storeService): Promise<ChannelUpdate> {
    const state = await storeService.getChannelState();

    switch (params.type) {
        case UpdateType.setup: {
            return generateSetupUpdate()
        }

        case UpdateType.deposit: {

        }

        case UpdateType.withdraw: {
            nonce
        }

        case UpdateType.create: {

        }

        case UpdateType.resolve: {

        }

        default: {
            throw new Error(`Unexpected UpdateType in params: ${params.type}`);
        }
    }
}

async function generateSetupUpdate(state: ChannelState): Promise<ChannelUpdate> {


    return {
        counterpartyPublicIdentifier: "", //TODO
        nonce: "0",
        type: 
    }
}