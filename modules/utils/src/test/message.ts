import {
  InboundChannelUpdateError,
  UpdateType,
  VectorChannelMessage,
  VectorErrorMessage,
  VectorMessage,
} from "@connext/vector-types";

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
    to: mkPublicIdentifier("indraBBB"),
    from: mkPublicIdentifier("indraAAA"),
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

export function createVectorErrorMessage(overrides: Partial<VectorErrorMessage> = {}): VectorErrorMessage {
  return {
    to: mkPublicIdentifier("indraBBB"),
    from: mkPublicIdentifier("indraAAA"),
    inbox: "test_inbox",
    error: new InboundChannelUpdateError(InboundChannelUpdateError.reasons.BadUpdateType, createTestChannelUpdate("setup")),
    ...overrides,
  };
}

export function createVectorMessage(
  type: "channel" | "error" = "channel",
  overrides: PartialVectorChannelMessage | Partial<VectorErrorMessage>,
): VectorMessage {
  if (type === "channel") {
    return createVectorChannelMessage(overrides);
  }
  return createVectorErrorMessage(overrides);
}
