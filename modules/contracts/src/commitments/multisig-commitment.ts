import {
  CommitmentTarget,
  EthereumCommitment,
  MinimalTransaction,
  MultisigTransaction,
} from "@connext/types";
import { recoverAddressFromChannelMessage } from "@connext/utils";
import { utils } from "ethers";

import * as Multisig from "../artifacts/Multisig.json";

const { Interface, keccak256, solidityKeccak256, solidityPack } = utils;

// A commitment to make Multisig perform a message call
export abstract class MultisigCommitment implements EthereumCommitment {
  constructor(
    readonly multisigAddress: string,
    readonly multisigOwners: string[],
    private initiatorSignature?: string,
    private responderSignature?: string,
  ) {}

  abstract getTransactionDetails(): MultisigTransaction;

  get signatures(): string[] {
    if (!this.initiatorSignature && !this.responderSignature) {
      return [];
    }
    return [this.initiatorSignature, this.responderSignature];
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
        throw new Error(
          `Invalid signer detected. Got ${recovered}, expected one of: ${this.multisigOwners}`,
        );
      }
    }
  }

  public async getSignedTransaction(): Promise<MinimalTransaction> {
    await this.assertSignatures();
    const multisigInput = this.getTransactionDetails();

    const txData = new Interface(Multisig.abi).encodeFunctionData("execTransaction", [
      multisigInput.to,
      multisigInput.value,
      multisigInput.data,
      multisigInput.operation,
      this.signatures,
    ]);

    return { to: this.multisigAddress, value: 0, data: txData };
  }

  public encode(): string {
    const { to, value, data, operation } = this.getTransactionDetails();
    return solidityPack(
      ["uint8", "address", "address", "uint256", "bytes32", "uint8"],
      [
        CommitmentTarget.MULTISIG,
        this.multisigAddress,
        to,
        value,
        solidityKeccak256(["bytes"], [data]),
        operation,
      ],
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
        throw new Error(
          `Invalid signer detected. Got ${recovered}, expected one of: ${this.multisigOwners}`,
        );
      }
    }
  }
}
