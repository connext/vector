import { Type, Static, TStringLiteral } from "@sinclair/typebox";

import { Address, Bytes32, PublicIdentifier } from "./basic";
import { TAddress, TPublicIdentifier } from "./schemas";
import { ChannelRpcMethods } from "./vectorProvider";

export const ConditionalTransferType = {
  LinkedTransfer: "LinkedTransfer",
} as const;
export type ConditionalTransferType = typeof ConditionalTransferType[keyof typeof ConditionalTransferType];

interface TransferParamsMap {
  [ConditionalTransferType.LinkedTransfer]: LinkedTransferParams;
}

export type LinkedTransferParams = {
  preImage: string;
};

export type ConditionalTransferParams<T extends ConditionalTransferType> = {
  channelAddress: Address;
  amount: string;
  assetId: Address;
  recipient?: PublicIdentifier;
  conditionType: T;
  routingId: Bytes32; // This is needed for hopped transfers, but it might get confusing against transferId
  details: TransferParamsMap[T];
  meta?: any;
};

export type ConditionalTransferResponse = {
  routingId: Bytes32;
};

export type ResolveConditionParams = any;
export type WithdrawParams = any;
export type TransferParams = any;

// These are from the node, may not be the right place
export type CreateTransferInput = any;

export const SetupInputSchema = Type.Object({
  counterpartyIdentifier: TPublicIdentifier,
  chainId: Type.Number({ minimum: 1 }),
  timeout: Type.String(),
});
export type SetupInput = Static<typeof SetupInputSchema>;

export const DepositInputSchema = Type.Object({
  channelAddress: TAddress,
  amount: Type.String(),
  assetId: TAddress,
});
export type DepositInput = Static<typeof DepositInputSchema>;

export const RpcRequestInputSchema = Type.Object({
  id: Type.Number({ minimum: 1 }),
  jsonrpc: Type.Literal("2.0"),
  method: Type.Union(
    Object.values(ChannelRpcMethods).map((methodName) => Type.Literal(methodName)) as [TStringLiteral<string>],
  ),
  params: Type.Any(),
});
export type RpcRequestInput = Static<typeof RpcRequestInputSchema>;

export type ChannelRpcMethodsPayloadMap = {
  [ChannelRpcMethods.chan_getChannelState]: string;
  [ChannelRpcMethods.chan_setup]: SetupInput;
  [ChannelRpcMethods.chan_deposit]: DepositInput;
  [ChannelRpcMethods.chan_createTransfer]: DepositInput;
  [ChannelRpcMethods.chan_resolveTransfer]: DepositInput;
};
