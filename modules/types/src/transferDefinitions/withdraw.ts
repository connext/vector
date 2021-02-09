import { SignatureString, Address, Bytes32 } from "../basic";
import { tidy } from "../utils";

export const WithdrawName = "Withdraw";

export type WithdrawState = {
  initiatorSignature: SignatureString;
  initiator: Address;
  responder: Address;
  data: Bytes32;
  nonce: string;
  fee: string;
  callTo: Address;
  callData: string;
};

export type WithdrawResolver = {
  responderSignature: SignatureString;
};

export const WithdrawStateEncoding = tidy(`tuple(
    bytes initiatorSignature,
    address initiator,
    address responder,
    bytes32 data,
    uint256 nonce,
    uint256 fee,
    address callTo,
    bytes callData
  )`);

export const WithdrawResolverEncoding = tidy(`tuple(
    bytes responderSignature
  )`);

export type WithdrawCommitmentJson = {
  aliceSignature?: string;
  bobSignature?: string;
  channelAddress: string;
  alice: string;
  bob: string;
  recipient: string;
  assetId: string;
  amount: string;
  nonce: string;
  callTo: string;
  callData: string;
  transactionHash?: string;
};
