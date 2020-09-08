import { UpdateParams, ChannelUpdate, UpdateType, ChannelState } from "./types";

// eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
export async function generateUpdate(params: UpdateParams, storeService: any): Promise<ChannelUpdate> {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
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

// eslint-disable-next-line @typescript-eslint/no-unused-vars
async function generateSetupUpdate(state: ChannelState): Promise<ChannelUpdate> {

    return {
        counterpartyPublicIdentifier: "", //TODO
        nonce: "0",
        type: "create",
    } as any;
}
