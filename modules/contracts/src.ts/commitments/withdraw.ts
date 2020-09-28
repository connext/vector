import { MinimalTransaction, WithdrawCommitmentJson } from "@connext/vector-types";
import { recoverAddressFromChannelMessage } from "@connext/vector-utils";
import { BigNumber, utils } from "ethers";

import { ChannelMastercopy } from "../artifacts";

const { Interface, keccak256, solidityPack } = utils;

export class WithdrawCommitment {
  private aliceSignature?: string;
  private bobSignature?: string;

  public constructor(
    public readonly channelAddress: string,
    public readonly signers: string[],
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
      signers: this.signers,
      recipient: this.recipient,
      assetId: this.assetId,
      amount: this.amount,
      nonce: this.nonce,
    };
  }

  public static async fromJson(json: WithdrawCommitmentJson): Promise<WithdrawCommitment> {
    const commitment = new WithdrawCommitment(
      json.channelAddress,
      json.signers,
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
      let recovered: string;
      try {
        recovered = await recoverAddressFromChannelMessage(hash, sig);
      } catch (e) {
        recovered = e.message;
      }
      if (recovered === this.signers[0]) {
        this.aliceSignature = sig;
      } else if (recovered === this.signers[1]) {
        this.bobSignature = sig;
      } else {
        throw new Error(`Invalid signer detected. Got ${recovered}, expected one of: ${this.signers}`);
      }
    }
  }
}
