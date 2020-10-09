import { HexString } from "../basic";
import { tidy } from "../utils";

export const HashlockTransferName = "HashlockTransfer";

export type HashlockTransferState = {
  lockHash: HexString;
  expiry: string;
};

export type HashlockTransferResolver = {
  preImage: HexString;
};

export const HashlockTransferStateEncoding = tidy(`tuple(
    bytes32 lockHash,
    uint256 expiry
  )`);

export const HashlockTransferResolverEncoding = tidy(`tuple(
    bytes32 preImage
  )`);
