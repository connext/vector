import { AddressZero, EtherSymbol } from "@ethersproject/constants";
import { Contract, ContractFactory } from "@ethersproject/contracts";
import { keccak256 } from "@ethersproject/keccak256";
import { formatEther, parseUnits } from "@ethersproject/units";
import { Wallet } from "@ethersproject/wallet";

import { AddressBook, AddressBookEntry } from "../addressBook";
import { artifacts } from "../artifacts";
import { logger } from "../constants";

const hash = (input: string): string => keccak256(`0x${input.replace(/^0x/, "")}`);

// 3rd arg is: [ContractName, [ConstructorArgs]][]
// If a ContractName is given as a ConstructorArg, it will be replaced by that contract's address
export const deployContracts = async (
  wallet: Wallet,
  addressBook: AddressBook,
  schema: [string, any[]][],
  log = logger.child({}),
): Promise<void> => {
  // Simple sanity checks to make sure contracts from our address book have been deployed
  const isContractDeployed = async (name: string, address: string | undefined): Promise<boolean> => {
    log.info(`Checking for valid ${name} contract...`);
    if (!address || address === "" || address === AddressZero) {
      log.info("This contract is not in our address book.");
      return false;
    }

    const savedCreationCodeHash = addressBook.getEntry(name).creationCodeHash;
    const creationCodeHash = hash(artifacts[name].bytecode || "0x00");
    if (!savedCreationCodeHash || savedCreationCodeHash !== creationCodeHash) {
      log.info(`creationCodeHash in our address book doen't match ${name} artifacts`);
      return false;
    }

    const savedRuntimeCodeHash = addressBook.getEntry(name).runtimeCodeHash;
    const runtimeCodeHash = hash(await wallet.provider.getCode(address));
    if (runtimeCodeHash === hash("0x00") || runtimeCodeHash === hash("0x")) {
      log.info("No runtimeCode exists at the address in our address book");
      return false;
    }

    if (savedRuntimeCodeHash !== runtimeCodeHash) {
      log.info(`runtimeCodeHash for ${address} does not match what's in our address book`);
      return false;
    }

    return true;
  };

  for (const [name, args] of schema) {
    if (!artifacts || !artifacts[name]) {
      throw new Error(`No contract artifacts are available for ${name}`);
    }

    const savedAddress = addressBook.getEntry(name).address;
    if (await isContractDeployed(name, savedAddress)) {
      log.info(`${name} is up to date, no action required. Address: ${savedAddress}`);
      continue;
    }

    const processedArgs = args.map((arg: any): any => {
      const entry = typeof arg === "string" ? addressBook.getEntry(arg) : { address: AddressZero };
      return entry.address !== AddressZero ? entry.address : arg;
    });

    log.info(`Deploying ${name} with args [${processedArgs.join(", ")}]`);
    const factory = ContractFactory.fromSolidity(artifacts[name]).connect(wallet);
    const deployTx = factory.getDeployTransaction(...processedArgs);
    const tx = await wallet.sendTransaction({ ...deployTx, gasPrice: parseUnits("100", 9) });

    log.info(`Sent transaction to deploy ${name}, txHash: ${tx.hash}`);
    const receipt = await tx.wait();
    const address = Contract.getContractAddress(tx);

    log.info(
      `Success! Consumed ${receipt.gasUsed} gas worth ${EtherSymbol} ${formatEther(
        receipt.gasUsed.mul(tx.gasPrice),
      )} deploying ${name} to address: ${address}`,
    );
    const runtimeCodeHash = hash(await wallet.provider.getCode(address));
    const creationCodeHash = hash(artifacts[name].bytecode);
    addressBook.setEntry(name, {
      address,
      args: processedArgs.length === 0 ? undefined : processedArgs,
      creationCodeHash,
      runtimeCodeHash,
      txHash: tx.hash,
    } as AddressBookEntry);
  }
};
