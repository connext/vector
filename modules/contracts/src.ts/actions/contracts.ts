import { AddressZero, EtherSymbol } from "@ethersproject/constants";
import { Contract, ContractFactory, Wallet, providers, utils } from "ethers";

import { AddressBook, AddressBookEntry } from "../utils";
import { artifacts } from "../artifacts";

const { formatEther, keccak256, parseUnits } = utils;

const hash = (input: string): string => keccak256(`0x${input.replace(/^0x/, "")}`);

export const deployContracts = async (
  wallet: Wallet,
  addressBook: AddressBook,
  schema: [string, string[]][],
): Promise<void> => {

  // Simple sanity checks to make sure contracts from our address book have been deployed
  const isContractDeployed = async (
    name: string,
    address: string | undefined,
    addressBook: AddressBook,
    provider: providers.Provider,
  ): Promise<boolean> => {
    console.log(`Checking for valid ${name} contract...`);
    if (!address || address === "" || address === AddressZero) {
      console.log("This contract is not in our address book.");
      return false;
    }

    const savedCreationCodeHash = addressBook.getEntry(name).creationCodeHash;
    console.log(`Artifacts: ${JSON.stringify(artifacts[name])}`);
    const creationCodeHash = hash(artifacts[name].bytecode || "0x00");
    if (!savedCreationCodeHash || savedCreationCodeHash !== creationCodeHash) {
      console.log(`creationCodeHash in our address book doen't match ${name} artifacts`);
      return false;
    }

    const savedRuntimeCodeHash = addressBook.getEntry(name).runtimeCodeHash;
    const runtimeCodeHash = hash(await provider.getCode(address));
    if (runtimeCodeHash === hash("0x00") || runtimeCodeHash === hash("0x")) {
      console.log("No runtimeCode exists at the address in our address book");
      return false;
    }

    if (savedRuntimeCodeHash !== runtimeCodeHash) {
      console.log(`runtimeCodeHash for ${address} does not match what's in our address book`);
      return false;
    }

    return true;
  };

  for (const [name, args] of schema) {
    if (!artifacts || !artifacts[name]) {
      throw new Error(`No contract artifacts are available for ${name}`);
    }

    const savedAddress = addressBook.getEntry(name).address;
    if (isContractDeployed(name, savedAddress, addressBook, wallet.provider)) {
      console.log(`${name} is up to date, no action required. Address: ${savedAddress}`);
      continue;
    }

    const processedArgs = args.map((arg: string): string => {
      const entry = addressBook.getEntry(arg);
      return entry.address !== AddressZero ? entry.address : arg;
    });

    console.log(`Deploying ${name} with args [${processedArgs.join(", ")}]`);
    const factory = ContractFactory.fromSolidity(artifacts[name]).connect(wallet);
    const deployTx = factory.getDeployTransaction(...processedArgs);
    const tx = await wallet.sendTransaction({ ...deployTx, gasPrice: parseUnits("100", 9) });

    console.log(`Sent transaction to deploy ${name}, txHash: ${tx.hash}`);
    const receipt = await tx.wait();
    const address = Contract.getContractAddress(tx);

    console.log(`Success! Consumed ${receipt.gasUsed} gas worth ${EtherSymbol} ${formatEther(receipt.gasUsed.mul(tx.gasPrice))} deploying ${name} to address: ${address}`);
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
