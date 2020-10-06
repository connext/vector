import { BalanceEncoding } from "../contracts";
import { tidy } from "../utils";

import { WithdrawResolver, WithdrawState } from "./withdraw";

export type TransferState = any | WithdrawState;

export type TransferResolver = any | WithdrawResolver;

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
