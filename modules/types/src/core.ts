// TODO: Fix all placeholders!

import { Address, Bytes32, PublicIdentifier } from "./basic";

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
  paymentId: Bytes32; // This is needed for hopped transfers, but it might get confusing against transferId
  details: TransferParamsMap[T];
  meta?: any;
};

export type ConditionalTransferResponse = {
  paymentId: Bytes32;
};

export type ResolveConditionParams = any;
export type WithdrawParams = any;
export type TransferParams = any;

// These are from the node, may not be the right place
export type DepositInput = any;
export type CreateTransferInput = any;
