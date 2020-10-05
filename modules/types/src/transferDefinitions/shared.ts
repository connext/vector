import { BalanceEncoding } from "../contracts";
import { tidy } from "../utils";

import {
  HashlockTransferName,
  HashlockTransferResolver,
  HashlockTransferState,
  HashlockTransferStateEncoding,
} from "./hashlockTransfer";
import { WithdrawName, WithdrawResolver, WithdrawState, WithdrawStateEncoding } from "./withdraw";

export type TransferState = HashlockTransferState | WithdrawState;

export type TransferResolver = HashlockTransferResolver | WithdrawResolver;

export const TransferName = {
  [HashlockTransferName]: HashlockTransferName,
  [WithdrawName]: WithdrawName,
} as const;
export type TransferName = keyof typeof TransferName;

export interface TransferNameToStateMap {
  [HashlockTransferName]: HashlockTransferState;
  [WithdrawName]: WithdrawState;
}

export type TransferStateEncodings = typeof HashlockTransferStateEncoding | typeof WithdrawStateEncoding;

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

export interface TransferStateMap {
  [TransferName.HashlockTransfer]: HashlockTransferState;
  [TransferName.Withdraw]: WithdrawState;
}

export interface TransferResolverMap {
  [TransferName.HashlockTransfer]: HashlockTransferResolver;
  [TransferName.Withdraw]: WithdrawResolver;
}
