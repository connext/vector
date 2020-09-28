import { MinimalTransaction, WithdrawCommitmentJson } from "@connext/vector-types";
import { recoverAddressFromChannelMessage } from "@connext/vector-utils";
import { BigNumber, utils } from "ethers";

import { ChannelMastercopy } from "../artifacts";

const { Interface, keccak256, solidityPack } = utils;

export class WithdrawCommitment {
  private aliceSignature?: string;
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
    if (this.aliceSignature) {
      sigs.push(this.aliceSignature);
    }
    if (this.responderSignature) {
      sigs.push(this.responderSignature);
    }
    return sigs;
  }

  public toJson(): WithdrawCommitmentJson {
    return {
      aliceSignature: this.aliceSignature,
      responderSignature: this.responderSignature,
      channelAddress: this.channelAddress,
      participants: this.participants,
      recipient: this.recipient,
      assetId: this.assetId,
      amount: this.amount,
      nonce: this.nonce,
    };
  }

  public static async fromJson(json: WithdrawCommitmentJson): Promise<WithdrawCommitment> {
    const commitment = new WithdrawCommitment(
      json.channelAddress,
      json.participants,
      json.recipient,
      json.assetId,
      json.amount,
      json.nonce,
    );
    if (json.aliceSignature || json.responderSignature) {
      await commitment.addSignatures(json.aliceSignature, json.responderSignature);
    }
    return commitment;
  }

  public hashToSign(): string {
    return keccak256(
      solidityPack(
        ["address", "address", "uint256", "uint256"],
        [this.recipient, this.assetId, this.amount, BigNumber.from(this.nonce)],
      ),
    );
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

  public async addSignatures(signature1?: string, signature2?: string): Promise<void> {
    for (const sig of [signature1, signature2]) {
      if (!sig) {
        continue;
      }
      const hash = this.hashToSign();
      const recovered = await recoverAddressFromChannelMessage(hash, sig);
      if (recovered === this.participants[0]) {
        this.aliceSignature = sig;
      } else if (recovered === this.participants[1]) {
        this.responderSignature = sig;
      } else {
        throw new Error(`Invalid signer detected. Got ${recovered}, expected one of: ${this.participants}`);
      }
    }
  }
}
