import { FullChannelState } from "./channel";

export type ChannelUpdateEvent = {
  direction: "inbound" | "outbound";
  updatedChannelState: FullChannelState;
};

export const EngineEventName = {
  CHANNEL_UPDATE_EVENT: "CHANNEL_UPDATE_EVENT",
  PROTOCOL_MESSAGE_EVENT: "PROTOCOL_MESSAGE_EVENT",
  PROTOCOL_ERROR_EVENT: "PROTOCOL_ERROR_EVENT",
} as const;
export type EngineEventName = typeof EngineEventName[keyof typeof EngineEventName];

export type InboundChannelError = any;
export type EngineEventPayloadsMap = {
  [EngineEventName.CHANNEL_UPDATE_EVENT]: ChannelUpdateEvent;
  [EngineEventName.PROTOCOL_MESSAGE_EVENT]: FullChannelState;
  [EngineEventName.PROTOCOL_ERROR_EVENT]: InboundChannelError;
};
