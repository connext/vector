import { UpdateParams, ChannelUpdate, UpdateType } from "./types";

export async function generateUpdate(params: UpdateParams, storeService): Promise<ChannelUpdate> {
    const state = await storeService.getChannelState();

    switch (params.type) {
        case UpdateType.setup: {

        }

        case UpdateType.deposit: {

        }

        case UpdateType.withdraw: {

        }

        case UpdateType.create: {

        }

        case UpdateType.resolve: {

        }

        default: {
            throw new Error(`Unexpected UpdateType in params: ${params.type}`);
        }
    }

    return {} as ChannelUpdate;
}