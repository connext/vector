import { Address, Bytes32, PublicIdentifier } from "./basic";
import { EngineParams } from "./schemas";
import { ChannelRpcMethods } from "./vectorProvider";

export const ConditionalTransferType = {
  LinkedTransfer: "LinkedTransfer",
} as const;
export type ConditionalTransferType = typeof ConditionalTransferType[keyof typeof ConditionalTransferType];

interface TransferParamsMap {
  [ConditionalTransferType.LinkedTransfer]: LinkedTransferParams;
}

interface ResolverParamsMap {
  [ConditionalTransferType.LinkedTransfer]: ResolveLinkedTransferParams
}

export type LinkedTransferParams = {
  preImage: string;
};

export type ResolveLinkedTransferParams = {
  preImage: string;
}

export type ConditionalTransferParams<T extends ConditionalTransferType> = {
  channelAddress: Address;
  amount: string;
  assetId: Address;
  recipient?: PublicIdentifier;
  timeout?: string;
  conditionType: T;
  routingId: Bytes32; // This is needed for hopped transfers, but it might get confusing against transferId
  details: TransferParamsMap[T];
  meta?: any;
};

export type ConditionalTransferResponse = {
  routingId: Bytes32;
};

export type ResolveConditionParams<T extends ConditionalTransferType> = {
  channelAddress: Address;
  conditionType: T;
  routingId: Bytes32; // This is needed for hopped transfers, but it might get confusing against transferId
  details: ResolverParamsMap[T];
  meta?: any;
};

export type WithdrawParams = any;
export type TransferParams = any;

// These are from the node, may not be the right place
export type CreateTransferInput = any;

export type ChannelRpcMethodsPayloadMap = {
  [ChannelRpcMethods.chan_getChannelState]: string;
  [ChannelRpcMethods.chan_setup]: EngineParams.Setup;
  [ChannelRpcMethods.chan_deposit]: EngineParams.Deposit;
  [ChannelRpcMethods.chan_createTransfer]: EngineParams.Deposit;
  [ChannelRpcMethods.chan_resolveTransfer]: EngineParams.Deposit;
};
