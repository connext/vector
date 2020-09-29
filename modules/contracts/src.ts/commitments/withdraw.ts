import { MinimalTransaction, WithdrawCommitmentJson } from "@connext/vector-types";
import { recoverAddressFromChannelMessage } from "@connext/vector-utils";
import { utils } from "ethers";

import { ChannelMastercopy } from "../artifacts";

const { Interface, keccak256, solidityPack } = utils;

export class WithdrawCommitment {
  private initiatorSignature?: string;
  private responderSignature?: string;

  public constructor(
    public readonly channelAddress: string,
    public readonly initiator: string,
    public readonly responder: string,
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

  public toJson(): WithdrawCommitmentJson {
    return {
      initiatorSignature: this.initiatorSignature,
      responderSignature: this.responderSignature,
      channelAddress: this.channelAddress,
      initiator: this.initiator,
      responder: this.responder,
      recipient: this.recipient,
      assetId: this.assetId,
      amount: this.amount,
      nonce: this.nonce,
    };
  }

  public static async fromJson(json: WithdrawCommitmentJson): Promise<WithdrawCommitment> {
    const commitment = new WithdrawCommitment(
      json.channelAddress,
      json.initiator,
      json.responder,
      json.recipient,
      json.assetId,
      json.amount,
      json.nonce,
    );
    if (json.initiatorSignature || json.responderSignature) {
      await commitment.addSignatures(json.initiatorSignature, json.responderSignature);
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
      this.initiatorSignature,
      this.responderSignature,
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
      if (recovered === this.initiator) {
        this.initiatorSignature = sig;
      } else if (recovered === this.responder) {
        this.responderSignature = sig;
      } else {
        throw new Error(
          `Invalid signer detected. Got ${recovered}, expected one of: ${this.initiator} / ${this.responder}`,
        );
      }
    }
  }
}
