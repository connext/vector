import { Address, Bytes32 } from "./basic";
import { Balance, FullTransferState } from "./channel";
import { EngineParams } from "./schemas";
import { TransferName } from "./transferDefinitions";
import { ChannelRpcMethod, ChannelRpcMethodsResponsesMap } from "./vectorProvider";

///////////////////////////////////
////// Engine transfer types
export type ConditionalTransferResponse = {
  routingId: Bytes32;
};

///////////////////////////////////
////// Engine event types
// Emitted on channel setup
export const SETUP_EVENT = "SETUP";
export type SetupPayload = {
  channelAddress: string;
  aliceIdentifier: string;
  bobIdentifier: string;
  chainId: number;
};

// Emitted when transfer created
export const CONDITIONAL_TRANSFER_CREATED_EVENT = "CONDITIONAL_TRANSFER_CREATED";
export type ConditionalTransferCreatedPayload = {
  channelAddress: string;
  transfer: FullTransferState;
  channelBalance: Balance;
  conditionType: TransferName | Address;
};

// Emitted when transfer resolved
export const CONDITIONAL_TRANSFER_RESOLVED_EVENT = "CONDITIONAL_TRANSFER_RESOLVED";
export type ConditionalTransferResolvedPayload = ConditionalTransferCreatedPayload;

// Emitted when an onchain deposit is reconciled with offchain balance
export const DEPOSIT_RECONCILED_EVENT = "DEPOSIT_RECONCILED";
export type DepositReconciledPayload = {
  channelAddress: string;
  assetId: string;
  channelBalance: Balance;
};

// Emitted when a counterparty requests collateral
export const REQUEST_COLLATERAL_EVENT = "REQUEST_COLLATERAL";
export type RequestCollateralPayload = {
  channelAddress: string;
  assetId: string;
  amount?: string;
};

// Emitted when a withdrawal transfer is created
export const WITHDRAWAL_CREATED_EVENT = "WITHDRAWAL_CREATED";
export type WithdrawalCreatedPayload = {
  channelAddress: string;
  transfer: FullTransferState;
  fee: string;
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
  channelAddress: string;
  transactionHash: string;
  transferId: string;
};

// Grouped event types
export const EngineEvents = {
  [SETUP_EVENT]: SETUP_EVENT,
  [CONDITIONAL_TRANSFER_CREATED_EVENT]: CONDITIONAL_TRANSFER_CREATED_EVENT,
  [CONDITIONAL_TRANSFER_RESOLVED_EVENT]: CONDITIONAL_TRANSFER_RESOLVED_EVENT,
  [DEPOSIT_RECONCILED_EVENT]: DEPOSIT_RECONCILED_EVENT,
  [REQUEST_COLLATERAL_EVENT]: REQUEST_COLLATERAL_EVENT,
  [WITHDRAWAL_CREATED_EVENT]: WITHDRAWAL_CREATED_EVENT,
  [WITHDRAWAL_RESOLVED_EVENT]: WITHDRAWAL_RESOLVED_EVENT,
  [WITHDRAWAL_RECONCILED_EVENT]: WITHDRAWAL_RECONCILED_EVENT,
} as const;
export type EngineEvent = typeof EngineEvents[keyof typeof EngineEvents];
export interface EngineEventMap {
  [SETUP_EVENT]: SetupPayload;
  [CONDITIONAL_TRANSFER_CREATED_EVENT]: ConditionalTransferCreatedPayload;
  [CONDITIONAL_TRANSFER_RESOLVED_EVENT]: ConditionalTransferResolvedPayload;
  [DEPOSIT_RECONCILED_EVENT]: DepositReconciledPayload;
  [REQUEST_COLLATERAL_EVENT]: RequestCollateralPayload;
  [WITHDRAWAL_CREATED_EVENT]: WithdrawalCreatedPayload;
  [WITHDRAWAL_RESOLVED_EVENT]: WithdrawalResolvedPayload;
  [WITHDRAWAL_RECONCILED_EVENT]: WithdrawalReconciledPayload;
}

///////////////////////////////////
////// Core engine interfaces
export interface IVectorEngine {
  publicIdentifier: string;
  signerAddress: string;
  request<T extends ChannelRpcMethod>(payload: EngineParams.RpcRequest): Promise<ChannelRpcMethodsResponsesMap[T]>;
  on<T extends EngineEvent>(
    event: T,
    callback: (payload: EngineEventMap[T]) => void | Promise<void>,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    filter?: (payload: EngineEventMap[T]) => boolean,
  ): void;
  once<T extends EngineEvent>(
    event: T,
    callback: (payload: EngineEventMap[T]) => void | Promise<void>,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    filter?: (payload: EngineEventMap[T]) => boolean,
  ): void;
  waitFor<T extends EngineEvent>(
    event: T,
    timeout: number,
    filter?: (payload: EngineEventMap[T]) => boolean,
  ): Promise<EngineEventMap[T]>;
  off<T extends EngineEvent>(event?: T): void;
}
