import { Balance } from "../channel";
import { SignatureString, Address, Bytes32 } from "../basic";

export type WithdrawState = {
  balance: Balance;
  initiatorSignature: SignatureString;
  initiator: Address;
  responder: Address;
  data: Bytes32;
  nonce: string;
  fee: string;
};

export type WithdrawResolver = {
  responderSignature: SignatureString;
};

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
};
