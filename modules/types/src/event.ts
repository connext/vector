import { TransactionReceipt, TransactionResponse } from "@ethersproject/providers";

import { FullTransferState, FullChannelState } from "./channel";
import { TransactionReason } from "./store";

////////////////////////////
///// PROTOCOL EVENTS

export type ChannelUpdateEvent = {
  updatedChannelState: FullChannelState;
  updatedTransfers?: FullTransferState[];
  updatedTransfer?: FullTransferState;
};

export const ProtocolEventName = {
  CHANNEL_UPDATE_EVENT: "CHANNEL_UPDATE_EVENT",
} as const;
export type ProtocolEventName = typeof ProtocolEventName[keyof typeof ProtocolEventName];

export type ProtocolEventPayloadsMap = {
  [ProtocolEventName.CHANNEL_UPDATE_EVENT]: ChannelUpdateEvent;
};

////////////////////////////
///// CHAIN SERVICE EVENTS
export type TransactionSubmittedPayload = {
  response: TransactionResponse;
  reason: TransactionReason;
  channelAddress: string;
};

export type TransactionMinedPayload = Omit<TransactionSubmittedPayload, "response"> & {
  receipt: TransactionReceipt;
};

export type TransactionFailedPayload = Omit<TransactionSubmittedPayload, "response"> & {
  receipt?: TransactionReceipt;
  error?: Error; // thrown
};

export const TransactionEvents = {
  TRANSACTION_SUBMITTED: "TRANSACTION_SUBMITTED",
  TRANSACTION_MINED: "TRANSACTION_MINED",
  TRANSACTION_FAILED: "TRANSACTION_FAILED",
} as const;
export type TransactionEvent = typeof TransactionEvents[keyof typeof TransactionEvents];

export interface TransactionEventMap {
  [TransactionEvents.TRANSACTION_SUBMITTED]: TransactionSubmittedPayload;
  [TransactionEvents.TRANSACTION_MINED]: TransactionMinedPayload;
  [TransactionEvents.TRANSACTION_FAILED]: TransactionFailedPayload;
}
