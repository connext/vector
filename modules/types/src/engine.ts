import { Bytes32 } from "./basic";
import { Balance, FullTransferState } from "./channel";
import { EngineParams } from "./schemas";
import { TransferName } from "./transferDefinitions";
import { ChannelRpcMethods, ChannelRpcMethodsResponsesMap } from "./vectorProvider";

export const ConditionalTransferType = {
  LinkedTransfer: "LinkedTransfer",
} as const;
export type ConditionalTransferType = typeof ConditionalTransferType[keyof typeof ConditionalTransferType];

export type ConditionalTransferResponse = {
  routingId: Bytes32;
};

// Emitted when transfer created
export const CONDITIONAL_TRANFER_CREATED_EVENT = "CONDITIONAL_TRANFER_CREATED";
export type ConditionalTransferCreatedPayload = {
  transferName: TransferName;
  routingId: Bytes32;
  transfer: FullTransferState;
  channelBalance: Balance;
};

// Emitted when transfer resolved
export const CONDITIONAL_TRANSFER_RESOLVED_EVENT = "CONDITIONAL_TRANSFER_RESOLVED";
export type ConditionalTransferResolvedPayload = ConditionalTransferCreatedPayload;

// Emitted when an onchain deposit is reconciled with offchain balance
export const DEPOSIT_RECONCILED_EVENT = "DEPOSIT_RECONCILED";
export type DepositReconciledPayload = {
  assetId: string;
  channelBalance: Balance;
};

// Emitted when a withdrawal transfer is created
export const WITHDRAWAL_CREATED_EVENT = "WITHDRAWAL_CREATED";
export type WithdrawalCreatedPayload = {
  assetId: string;
  amount: string;
  recipient: string;
  channelBalance: Balance;
};

// Emitted when a withdrawal transfer is resolved
export const WITHDRAWAL_RESOLVED_EVENT = "WITHDRAWAL_RESOLVED";
export type WithdrawalResolvedPayload = WithdrawalCreatedPayload;

// Emitted when withdrawal commitment is submitted to chain
export const WITHDRAWAL_RECONCILED_EVENT = "WITHDRAWAL_RECONCILED";
export type WithdrawalReconciledPayload = {
  transactionHash: string;
};

// Grouped event types
export const EngineEvents = {
  [CONDITIONAL_TRANFER_CREATED_EVENT]: CONDITIONAL_TRANFER_CREATED_EVENT,
  [CONDITIONAL_TRANSFER_RESOLVED_EVENT]: CONDITIONAL_TRANSFER_RESOLVED_EVENT,
  [DEPOSIT_RECONCILED_EVENT]: DEPOSIT_RECONCILED_EVENT,
  [WITHDRAWAL_CREATED_EVENT]: WITHDRAWAL_CREATED_EVENT,
  [WITHDRAWAL_RESOLVED_EVENT]: WITHDRAWAL_RESOLVED_EVENT,
  [WITHDRAWAL_RECONCILED_EVENT]: WITHDRAWAL_RECONCILED_EVENT,
} as const;
export type EngineEvent = typeof EngineEvents[keyof typeof EngineEvents];
export interface EngineEventMap {
  [CONDITIONAL_TRANFER_CREATED_EVENT]: ConditionalTransferCreatedPayload;
  [CONDITIONAL_TRANSFER_RESOLVED_EVENT]: ConditionalTransferResolvedPayload;
  [DEPOSIT_RECONCILED_EVENT]: DepositReconciledPayload;
  [WITHDRAWAL_CREATED_EVENT]: WithdrawalCreatedPayload;
  [WITHDRAWAL_RESOLVED_EVENT]: WithdrawalResolvedPayload;
  [WITHDRAWAL_RECONCILED_EVENT]: WithdrawalReconciledPayload;
}

export interface IVectorEngine {
  request<T extends ChannelRpcMethods>(payload: EngineParams.RpcRequest): Promise<ChannelRpcMethodsResponsesMap[T]>;
}
