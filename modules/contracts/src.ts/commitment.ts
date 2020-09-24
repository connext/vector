import { MinimalTransaction } from "@connext/vector-types";
import { recoverAddressFromChannelMessage } from "@connext/vector-utils";
import { BigNumber, constants, utils } from "ethers";

import { ChannelMastercopy, ERC20 } from "./artifacts";

const { Interface, keccak256, solidityKeccak256, solidityPack } = utils;

export class WithdrawCommitment {
  private initiatorSignature?: string;
  private responderSignature?: string;

  public constructor(
    public readonly multisigAddress: string,
    public readonly multisigOwners: string[],
    public readonly recipient: string,
    public readonly assetId: string,
    public readonly amount: string,
    public readonly nonce: string,
  ) {}

  public getTransactionDetails(): MinimalTransaction {
    if (this.assetId == constants.AddressZero) {
      return {
        to: this.recipient,
        value: BigNumber.from(this.amount),
        data: "0x",
      };
    } else {
      return {
        to: this.assetId,
        value: 0,
        data: new Interface(ERC20.abi).encodeFunctionData("transfer", [this.recipient, BigNumber.from(this.amount)]),
      };
    }
  }

  get signatures(): string[] {
    if (!this.initiatorSignature && !this.responderSignature) {
      return [];
    }
    return [this.initiatorSignature!, this.responderSignature!];
  }

  set signatures(sigs: string[]) {
    throw new Error(`Use "addSignatures" to ensure the correct sorting`);
  }

  public async addSignatures(signature1: string, signature2: string): Promise<void> {
    for (const sig of [signature1, signature2]) {
      const recovered = await recoverAddressFromChannelMessage(this.hashToSign(), sig);
      if (recovered === this.multisigOwners[0]) {
        this.initiatorSignature = sig;
      } else if (recovered === this.multisigOwners[1]) {
        this.responderSignature = sig;
      } else {
        throw new Error(`Invalid signer detected. Got ${recovered}, expected one of: ${this.multisigOwners}`);
      }
    }
  }

  public async getSignedTransaction(): Promise<MinimalTransaction> {
    await this.assertSignatures();
    const multisigInput = this.getTransactionDetails();

    const txData = new Interface(ChannelMastercopy.abi).encodeFunctionData("execTransaction", [
      multisigInput.to,
      multisigInput.value,
      multisigInput.data,
      BigNumber.from(this.nonce),
      this.signatures,
    ]);

    return { to: this.multisigAddress, value: 0, data: txData };
  }

  public encode(): string {
    const { to, value, data } = this.getTransactionDetails();
    return solidityPack(
      ["address", "address", "uint256", "bytes32", "uint256"],
      [this.multisigAddress, to, value, solidityKeccak256(["bytes"], [data]), BigNumber.from(this.nonce)],
    );
  }

  public hashToSign(): string {
    return keccak256(this.encode());
  }

  public async assertSignatures(): Promise<void> {
    if (!this.signatures || this.signatures.length === 0) {
      throw new Error(`No signatures detected`);
    }
    // assert recovery
    for (const sig of this.signatures) {
      const recovered = await recoverAddressFromChannelMessage(this.hashToSign(), sig);
      if (!this.multisigOwners.includes(recovered)) {
        throw new Error(`Invalid signer detected. Got ${recovered}, expected one of: ${this.multisigOwners}`);
      }
    }
  }
}
