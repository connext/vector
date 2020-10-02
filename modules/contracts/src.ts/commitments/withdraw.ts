import { MinimalTransaction, WithdrawCommitmentJson } from "@connext/vector-types";
import { recoverAddressFromChannelMessage } from "@connext/vector-utils";
import { utils } from "ethers";

import { ChannelMastercopy } from "../artifacts";

const { Interface, keccak256, solidityPack } = utils;

export class WithdrawCommitment {
  private aliceSignature?: string;
  private bobSignature?: string;

  public constructor(
    public readonly channelAddress: string,
    public readonly alice: string,
    public readonly bob: string,
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
    if (this.bobSignature) {
      sigs.push(this.bobSignature);
    }
    return sigs;
  }

  public toJson(): WithdrawCommitmentJson {
    return {
      aliceSignature: this.aliceSignature,
      bobSignature: this.bobSignature,
      channelAddress: this.channelAddress,
      alice: this.alice,
      bob: this.bob,
      recipient: this.recipient,
      assetId: this.assetId,
      amount: this.amount,
      nonce: this.nonce,
    };
  }

  public static async fromJson(json: WithdrawCommitmentJson): Promise<WithdrawCommitment> {
    const commitment = new WithdrawCommitment(
      json.channelAddress,
      json.alice,
      json.bob,
      json.recipient,
      json.assetId,
      json.amount,
      json.nonce,
    );
    if (json.aliceSignature || json.bobSignature) {
      await commitment.addSignatures(json.aliceSignature, json.bobSignature);
    }
    return commitment;
  }

  public hashToSign(): string {
    return keccak256(
      solidityPack(
        ["address", "address", "uint256", "uint256"],
        [this.recipient, this.assetId, this.amount, this.nonce],
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
      this.nonce,
      this.aliceSignature,
      this.bobSignature,
    ]);
    return { to: this.channelAddress, value: 0, data: txData };
  }
  public async addSignatures(signature1?: string, signature2?: string): Promise<void> {
    const hash = this.hashToSign();
    for (const sig of [signature1, signature2]) {
      if (!sig) {
        continue;
      }
      let recovered: string;
      try {
        recovered = await recoverAddressFromChannelMessage(hash, sig);
      } catch (e) {
        recovered = e.message;
      }
      if (recovered !== this.alice && recovered !== this.bob) {
        throw new Error(`Invalid signer detected. Got ${recovered}, expected one of: ${this.alice} / ${this.bob}`);
      }
      this.aliceSignature = recovered === this.alice ? sig : this.aliceSignature;
      this.bobSignature = recovered === this.bob ? sig : this.bobSignature;
    }
  }
}
