import { UpdateParams, ChannelUpdate, UpdateType, ChannelState } from "./types";

export async function generateUpdate(params: UpdateParams, storeService): Promise<ChannelUpdate> {
    const state = await storeService.getChannelState();

    switch (params.type) {
        case UpdateType.setup: { //TODO, do we actually need setup?
          return generateSetupUpdate(0 as any);
        }

        case UpdateType.deposit: {

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
        type: "create",
    } as any;
}
