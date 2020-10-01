import { Balance } from "../channel";
import { HexString } from "../basic";
import { tidy } from "../utils";
import { BalanceEncoding } from "../contracts";

export const HashlockTransferName = "HashlockTransfer";

export type HashlockTransferState = {
  balance: Balance;
  lockHash: HexString;
  expiry: string;
};

export type HashlockTransferResolver = {
  preImage: HexString;
};

export const HashlockTransferStateEncoding = tidy(`tuple(
    ${BalanceEncoding} balance,
    bytes32 lockHash,
    uint256 expiry
  )`);

export const HashlockTransferResolverEncoding = tidy(`tuple(
    bytes32 preImage
  )`);
