import { TransactionReceipt, TransactionResponse } from "@ethersproject/providers";

import { FullTransferState, FullChannelState, CoreChannelState, CoreTransferState, Balance } from "./channel";
import { ChannelDispute, TransferDispute } from "./dispute";
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

// Transaction submission events
export type StringifiedTransactionReceipt = Omit<TransactionReceipt, "gasUsed" | "cumulativeGasUsed"> & {
  gasUsed: string;
  cumulativeGasUsed: string;
};

export type StringifiedTransactionResponse = Omit<TransactionResponse, "gasLimit" | "gasPrice" | "value"> & {
  gasLimit: string;
  gasPrice: string;
  value: string;
};

export type TransactionSubmittedPayload = {
  response: StringifiedTransactionResponse;
  reason: TransactionReason;
  channelAddress: string;
};

export type TransactionMinedPayload = Omit<TransactionSubmittedPayload, "response"> & {
  receipt: StringifiedTransactionReceipt;
};

export type TransactionFailedPayload = Omit<TransactionSubmittedPayload, "response"> & {
  receipt?: StringifiedTransactionReceipt;
  error?: Error; // thrown
};

// Channel and transfer dispute events
// These types stay as close as possible to what is emitted
// from the contracts because the chainReader is stateless
export type ChannelDisputedPayload = {
  disputer: string;
  state: CoreChannelState;
  dispute: ChannelDispute;
};

export type ChannelDefundedPayload = {
  defunder: string;
  state: CoreChannelState;
  dispute: ChannelDispute;
  defundedAssets: string[];
};

export type TransferDisputedPayload = {
  disputer: string;
  state: CoreTransferState;
  dispute: TransferDispute;
};

export type TransferDefundedPayload = {
  defunder: string;
  state: CoreTransferState;
  dispute: TransferDispute;
  encodedInitialState: string;
  encodedTransferResolver: string;
  balance: Balance;
};

export const ChainReaderEvents = {
  CHANNEL_DISPUTED: "CHANNEL_DISPUTED",
  CHANNEL_DEFUNDED: "CHANNEL_DEFUNDED",
  TRANSFER_DISPUTED: "TRANSFER_DISPUTED",
  TRANSFER_DEFUNDED: "TRANSFER_DEFUNDED",
} as const;
export type ChainReaderEvent = typeof ChainReaderEvents[keyof typeof ChainReaderEvents];
export interface ChainReaderEventMap {
  [ChainReaderEvents.CHANNEL_DISPUTED]: ChannelDisputedPayload;
  [ChainReaderEvents.CHANNEL_DEFUNDED]: ChannelDefundedPayload;
  [ChainReaderEvents.TRANSFER_DISPUTED]: TransferDisputedPayload;
  [ChainReaderEvents.TRANSFER_DEFUNDED]: TransferDefundedPayload;
}

export const ChainServiceEvents = {
  ...ChainReaderEvents,
  TRANSACTION_SUBMITTED: "TRANSACTION_SUBMITTED",
  TRANSACTION_MINED: "TRANSACTION_MINED",
  TRANSACTION_FAILED: "TRANSACTION_FAILED",
} as const;
export type ChainServiceEvent = typeof ChainServiceEvents[keyof typeof ChainServiceEvents];

export interface ChainServiceEventMap extends ChainReaderEventMap {
  [ChainServiceEvents.TRANSACTION_SUBMITTED]: TransactionSubmittedPayload;
  [ChainServiceEvents.TRANSACTION_MINED]: TransactionMinedPayload;
  [ChainServiceEvents.TRANSACTION_FAILED]: TransactionFailedPayload;
}
