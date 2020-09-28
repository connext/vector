import { Balance } from "../channel";
import { SignatureString, Address, Bytes32 } from "../basic";
import { tidy } from "../utils";
import { BalanceEncoding } from "../contracts";

export const WithdrawName = "Withdraw";

export type WithdrawState = {
  balance: Balance;
  aliceSignature: SignatureString;
  signers: Address[];
  data: Bytes32;
  nonce: Bytes32;
  fee: string;
};

export type WithdrawResolver = {
  bobSignature: SignatureString;
};

export const WithdrawStateEncoding = tidy(`tuple(
    ${BalanceEncoding} balance,
    bytes aliceSignature,
    address[2] signers,
    bytes32 data,
    bytes32 nonce,
    uint256 fee
  )`);

export const WithdrawResolverEncoding = tidy(`tuple(
    bytes bobSignature
  )`);

export type WithdrawCommitmentJson = {
  aliceSignature?: string;
  bobSignature?: string;
  channelAddress: string;
  signers: string[];
  recipient: string;
  assetId: string;
  amount: string;
  nonce: string;
};
