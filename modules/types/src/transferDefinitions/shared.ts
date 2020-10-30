import { Address } from "../basic";
import { BalanceEncoding } from "../contracts";
import { Values } from "../error";
import { tidy } from "../utils";

import {
  HashlockTransferName,
  HashlockTransferResolver,
  HashlockTransferResolverEncoding,
  HashlockTransferState,
  HashlockTransferStateEncoding,
} from "./hashlockTransfer";
import {
  WithdrawName,
  WithdrawResolver,
  WithdrawResolverEncoding,
  WithdrawState,
  WithdrawStateEncoding,
} from "./withdraw";

// Must be updated when adding a new transfer
export const TransferNames = {
  [HashlockTransferName]: HashlockTransferName,
  [WithdrawName]: WithdrawName,
} as const;

// Must be updated when adding a new transfer
export interface TransferResolverMap {
  [HashlockTransferName]: HashlockTransferResolver;
  [WithdrawName]: WithdrawResolver;
}

// Must be updated when adding a new transfer
export interface TransferStateMap {
  [HashlockTransferName]: HashlockTransferState;
  [WithdrawName]: WithdrawState;
}

// Must be updated when adding a new transfer
export const TransferEncodingsMap = {
  [HashlockTransferName]: [HashlockTransferStateEncoding, HashlockTransferResolverEncoding],
  [WithdrawName]: [WithdrawStateEncoding, WithdrawResolverEncoding],
} as const;

export type TransferName = keyof typeof TransferNames;
export type TransferState = Values<TransferStateMap>;
export type TransferResolver = Values<TransferResolverMap>;
export type TransferEncodings = Values<typeof TransferEncodingsMap>;

export type RegisteredTransfer<T extends TransferName = any> = {
  stateEncoding: typeof TransferEncodingsMap[T][0];
  resolverEncoding: typeof TransferEncodingsMap[T][1];
  definition: Address;
  name: T;
};
