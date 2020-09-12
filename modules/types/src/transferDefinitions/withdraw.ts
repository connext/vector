import { Balance } from "../channel";
import { SignatureString, Address, Bytes32 } from "../basic";
import { tidy } from "../utils";
import { BalanceEncoding } from "../contracts";

export const WithdrawName = "Withdraw";

export type WithdrawState = {
  balance: Balance;
  initiatorSignature: SignatureString;
  signers: Address[];
  data: Bytes32;
  nonce: Bytes32;
  fee: string;
};

export type WithdrawResolver = {
  responderSignature: SignatureString;
};

export const WithdrawStateEncoding = tidy(`tuple(
    ${BalanceEncoding} balance,
    bytes initiatorSignature,
    address[2] signers,
    bytes32 data,
    bytes32 nonce,
    uint256 fee
  )`);

export const WithdrawResolverEncoding = tidy(`tuple(
    bytes responderSignature
  )`);
