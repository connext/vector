import { ChannelUpdate, ChannelState, UpdateType } from "./types";

export function validate(update: ChannelUpdate, state: ChannelState): void {
  // By the time this function is called, you should assume that the update has been deduped/recovered
  // Therefore, validate should only be called when this is a *new update* that needs to be acked

  if (update.nonce !== state.latestNonce + 1) {
    throw new Error(`Incorrect nonce in validator -- this should never happen!`);
  }

  // First validate update fields to make sure everything is defined and of the right type

  // Then do some base validation -- signatures?

  // Then break out into type-specific validation
  switch (update.type) {
    case UpdateType.setup: {
    }

    case UpdateType.deposit: 
    }

    case UpdateType.create: {
    }

    case UpdateType.resolve: {
    }

    default: {
      throw new Error(`Unexpected UpdateType in received update: ${update.type}`);
    }
  }
}
