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
};

export type TransferName = keyof typeof TransferNames;
export type TransferState = Values<TransferStateMap>;
export type TransferResolver = Values<TransferResolverMap>;
export type TransferEncodings = Values<typeof TransferEncodingsMap>;

export const CoreTransferStateEncoding = tidy(`tuple(
  ${BalanceEncoding} initialBalance,
  address assetId,
  address channelAddress,
  bytes32 transferId,
  address transferDefinition,
  uint256 transferTimeout,
  bytes32 initialStateHash,
  address initiator,
  address responder
)`);
