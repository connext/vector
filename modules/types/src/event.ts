import { FullChannelState, FullTransferState } from "./channel";

export type ChannelUpdateEvent = {
  updatedChannelState: FullChannelState;
  updatedTransfers?: FullTransferState[];
};

export const ProtocolEventName = {
  CHANNEL_UPDATE_EVENT: "CHANNEL_UPDATE_EVENT",
} as const;
export type ProtocolEventName = typeof ProtocolEventName[keyof typeof ProtocolEventName];

export type ProtocolEventPayloadsMap = {
  [ProtocolEventName.CHANNEL_UPDATE_EVENT]: ChannelUpdateEvent;
};
