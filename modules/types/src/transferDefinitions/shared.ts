import { BalanceEncoding } from "../contracts";
import { tidy } from "../utils";

import {
  LinkedTransferName,
  LinkedTransferResolver,
  LinkedTransferState,
  LinkedTransferStateEncoding,
} from "./linkedTransfer";
import { WithdrawName, WithdrawResolver, WithdrawState, WithdrawStateEncoding } from "./withdraw";

export type TransferState = LinkedTransferState | WithdrawState;

export type TransferResolver = LinkedTransferResolver | WithdrawResolver;

export const TransferName = {
  [LinkedTransferName]: LinkedTransferName,
  [WithdrawName]: WithdrawName,
} as const;
export type TransferName = keyof typeof TransferName;

export interface TransferNameToStateMap {
  [LinkedTransferName]: LinkedTransferState;
  [WithdrawName]: WithdrawState;
}

export type TransferStateEncodings = typeof LinkedTransferStateEncoding | typeof WithdrawStateEncoding;

export const CoreTransferStateEncoding = tidy(`tuple(
  ${BalanceEncoding} initialBalance,
  address assetId,
  address channelAddress,
  bytes32 transferId,
  address transferDefinition,
  uint256 transferTimeout,
  bytes32 initialStateHash,
  address[2] signers
)`);

export interface TransferStateMap {
  [TransferName.LinkedTransfer]: LinkedTransferState;
  [TransferName.Withdraw]: WithdrawState;
}

export interface TransferResolverMap {
  [TransferName.LinkedTransfer]: LinkedTransferResolver;
  [TransferName.Withdraw]: WithdrawResolver;
}
