import { UpdateType, VectorChannelMessage } from "@connext/vector-types";

import { createTestChannelUpdate, PartialChannelUpdate } from "./channel";
import { mkPublicIdentifier } from "./util";

type PartialVectorChannelMessageData<T extends UpdateType = any> = Partial<{
  update: PartialChannelUpdate<T>;
  latestUpdate: PartialChannelUpdate<T> | undefined;
}>;

type PartialVectorChannelMessage<T extends UpdateType = any> = Partial<
  Omit<VectorChannelMessage<T>, "data"> & { data: PartialVectorChannelMessageData<T> }
>;

export function createVectorChannelMessage(overrides: PartialVectorChannelMessage = {}): VectorChannelMessage {
  // Generate the proper data fields given the overrides
  const { data, ...defaults } = overrides;
  const update = {
    ...createTestChannelUpdate(data?.update?.type ?? UpdateType.setup, data?.update),
  };
  const latestUpdate = data?.latestUpdate && {
    ...createTestChannelUpdate(data?.latestUpdate?.type ?? UpdateType.setup, data?.latestUpdate),
  };
  return {
    to: mkPublicIdentifier("vectorBBB"),
    from: mkPublicIdentifier("vectorAAA"),
    inbox: "test_inbox",
    data: {
      update: {
        ...update,
        fromIdentifier: defaults.from ?? update.fromIdentifier,
        toIdentifier: defaults.to ?? update.toIdentifier,
      },
      latestUpdate,
    },
    ...defaults,
  };
}
