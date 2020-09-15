import { FullChannelState } from "./channel";
import { ChannelUpdateError } from "./error";

export type ChannelUpdateEvent = {
  direction: "inbound" | "outbound";
  updatedChannelState: FullChannelState;
};

export const ProtocolEventName = {
  CHANNEL_UPDATE_EVENT: "CHANNEL_UPDATE_EVENT",
  PROTOCOL_MESSAGE_EVENT: "PROTOCOL_MESSAGE_EVENT",
  PROTOCOL_ERROR_EVENT: "PROTOCOL_ERROR_EVENT",
} as const;
export type ProtocolEventName = typeof ProtocolEventName[keyof typeof ProtocolEventName];

export type ProtocolEventPayloadsMap = {
  [ProtocolEventName.CHANNEL_UPDATE_EVENT]: ChannelUpdateEvent;
  [ProtocolEventName.PROTOCOL_MESSAGE_EVENT]: FullChannelState;
  [ProtocolEventName.PROTOCOL_ERROR_EVENT]: ChannelUpdateError;
};
