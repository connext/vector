import { MinimalTransaction, WithdrawCommitmentJson, WithdrawDataEncoding } from "@connext/vector-types";
import { recoverAddressFromChannelMessage } from "@connext/vector-utils";
import { BigNumber, utils } from "ethers";
import { AddressZero, Zero } from "@ethersproject/constants";

import { ChannelMastercopy } from "../artifacts";
import * as ERC20 from "@openzeppelin/contracts/build/contracts/IERC20.json";

const { defaultAbiCoder, Interface, keccak256 } = utils;


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

  public getCallData() {
    return this.assetId === AddressZero
      ? {
        to: this.recipient,
        value: this.amount,
        data: "0x",
      }
      : {
        to: this.assetId,
        value: Zero,
        data: new Interface(ERC20.abi).encodeFunctionData("transfer", [this.recipient, BigNumber.from(this.amount)]),
      };
  }

  public getWithdrawData() {
    const callData = this.getCallData();
    return [
      this.channelAddress,
      this.assetId,
      this.recipient,
      this.amount,
      this.nonce,
      callData.to,
      callData.value,
      callData.data,
    ];
  }

  public hashToSign(): string {
    const withdrawData = this.getWithdrawData();
    const encodedWithdrawData = defaultAbiCoder.encode(
      [WithdrawDataEncoding],
      [withdrawData],
    );
    // TODO: include commitment type
    return keccak256(encodedWithdrawData);
  }

  public async getSignedTransaction(): Promise<MinimalTransaction> {
    if (!this.signatures || this.signatures.length === 0) {
      throw new Error(`No signatures detected`);
    }
    const callData = this.getCallData();
    const data = new Interface(ChannelMastercopy.abi).encodeFunctionData("withdraw", [
      [
        this.channelAddress,
        this.assetId,
        this.recipient,
        this.amount,
        this.nonce,
        callData.to,
        callData.value,
        callData.data,
      ],
      this.aliceSignature,
      this.bobSignature,
    ]);
    return { to: this.channelAddress, value: 0, data: data };
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
