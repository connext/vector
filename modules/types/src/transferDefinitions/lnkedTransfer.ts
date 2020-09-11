import { Balance } from "../channel";
import { HexString } from "../basic";
import { tidy } from "../utils";
import { BalanceEncoding } from "../contracts";

export type LinkedTransferState = {
  balance: Balance;
  linkedHash: HexString;
};

export type LinkedTransferResolver = {
  preImage: HexString;
};

export const LinkedTransferStateEncoding = tidy(`tuple(
    ${BalanceEncoding} balance,
    bytes32 linkedHash,
  )`);

export const LinkedTransferResolverEncoding = tidy(`tuple(
    bytes32 preImage
  )`);
