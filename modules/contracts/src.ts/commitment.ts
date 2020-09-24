import { MinimalTransaction } from "@connext/vector-types";
import { recoverAddressFromChannelMessage } from "@connext/vector-utils";
import { BigNumber, utils } from "ethers";

import { ChannelMastercopy } from "./artifacts";

const { Interface, keccak256, solidityPack } = utils;

export class WithdrawCommitment {
  private initiatorSignature?: string;
  private responderSignature?: string;

  public constructor(
    public readonly channelAddress: string,
    public readonly participants: string[],
    public readonly recipient: string,
    public readonly assetId: string,
    public readonly amount: string,
    public readonly nonce: string,
  ) {}

  get signatures(): string[] {
    const sigs: string[] = [];
    if (this.initiatorSignature) {
      sigs.push(this.initiatorSignature);
    }
    if (this.responderSignature) {
      sigs.push(this.responderSignature);
    }
    return sigs;
  }

  public hashToSign(): string {
    return keccak256(solidityPack(
      ["address", "address", "uint256", "uint256"],
      [this.recipient, this.assetId, this.amount, BigNumber.from(this.nonce)],
    ));
  }

  public async getSignedTransaction(): Promise<MinimalTransaction> {
    if (!this.signatures || this.signatures.length === 0) {
      throw new Error(`No signatures detected`);
    }
    const txData = new Interface(ChannelMastercopy.abi).encodeFunctionData("withdraw", [
      this.recipient,
      this.assetId,
      this.amount,
      BigNumber.from(this.nonce),
      this.signatures,
    ]);
    return { to: this.channelAddress, value: 0, data: txData };
  }

  public async addSignatures(signature1: string, signature2: string): Promise<void> {
    for (const sig of [signature1, signature2]) {
      const hash = this.hashToSign();
      const recovered = await recoverAddressFromChannelMessage(hash, sig);
      if (recovered === this.participants[0]) {
        this.initiatorSignature = sig;
      } else if (recovered === this.participants[1]) {
        this.responderSignature = sig;
      } else {
        throw new Error(`Invalid signer detected. Got ${recovered}, expected one of: ${this.participants}`);
      }
    }
  }

}
