import { MultisigCommitment, } from "./multisig-commitment";
import { ERC20 } from "../artifacts";

import {
  MinimalTransaction
} from "@connext/vector-types";
import { constants, utils } from "ethers";

const { Interface } = utils;

export class WithdrawCommitment extends MultisigCommitment {
  public constructor(
    public readonly multisigAddress: string,
    public readonly multisigOwners: string[],
    public readonly recipient: string,
    public readonly assetId: string,
    public readonly amount: string,
    public readonly nonce: string,
  ) {
    super(multisigAddress, multisigOwners, nonce);
  }

  public getTransactionDetails(): MinimalTransaction {
    if(this.assetId == constants.HashZero) {
        return {
            to: this.recipient,
            value: this.amount,
            data: "0x"
        }
    } else {
        return {
            to: this.assetId,
            value: 0,
            data: new Interface(ERC20.abi).encodeFunctionData("transfer", [
                this.multisigAddress,
                this.recipient,
                this.amount
            ]),
        };
    }
  }
}