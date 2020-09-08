import { Contract, ContractFactory, Wallet, providers, utils, BigNumber } from "ethers";

import { AddressBook } from "./address-book";
import { artifacts } from "./artifacts";
// import { stringify } from "@connext/utils";

const { keccak256 } = utils;

const hash = (input: string): string => keccak256(`0x${input.replace(/^0x/, "")}`);

// Simple sanity checks to make sure contracts from our address book have been deployed
export const isContractDeployed = async (
  name: string,
  address: string | undefined,
  addressBook: AddressBook,
  provider: providers.Provider,
): Promise<boolean> => {
  console.log(`Checking for valid ${name} contract...`);
  if (!address || address === "") {
    console.log("This contract is not in our address book.");
    return false;
  }
  const savedCreationCodeHash = addressBook.getEntry(name).creationCodeHash;
  const creationCodeHash = hash(artifacts[name].bytecode);
  if (!savedCreationCodeHash || savedCreationCodeHash !== creationCodeHash) {
    console.log(`creationCodeHash in our address book doen't match ${name} artifacts`);
    console.log(`${savedCreationCodeHash} !== ${creationCodeHash}`);
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
    console.log(`${savedRuntimeCodeHash} !== ${runtimeCodeHash}`);
    return false;
  }
  return true;
};

export const deployContract = async (
  name: string,
  args: Array<{ name: string; value: string }>,
  wallet: Wallet,
  addressBook: AddressBook,
): Promise<Contract> => {
  // NOTE: No special case for testnet token bc non-testnet-tokens are not mintable & throw errors
  const factory = ContractFactory.fromSolidity(artifacts[name]).connect(wallet);
  const constructorArgs = args.map((a) => a.value);
  const deployTx = factory.getDeployTransaction(...constructorArgs);
  const tx = await wallet.sendTransaction({
    ...deployTx,
    gasLimit: BigNumber.from("5000000"),
  });
  console.log(`Sent transaction to deploy ${name}, txHash: ${tx.hash}`);
  const receipt = await tx.wait();
  // const { gasUsed, cumulativeGasUsed } = receipt;
  // console.log(`Gas from deploy:`, stringify({ gasUsed, cumulativeGasUsed }));
  const address = Contract.getContractAddress(tx);
  const contract = new Contract(address, artifacts[name].abi, wallet);
  console.log(`${name} has been deployed to address: ${address}\n`);
  const runtimeCodeHash = hash(await wallet.provider.getCode(address));
  const creationCodeHash = hash(artifacts[name].bytecode);
  addressBook.setEntry(name, {
    address,
    constructorArgs: args.length === 0 ? undefined : args,
    creationCodeHash,
    runtimeCodeHash,
    txHash: tx.hash,
  });

  return contract;
};
