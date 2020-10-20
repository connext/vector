import fs from "fs";

import { AddressZero } from "@ethersproject/constants";
import { Contract, providers, Wallet } from "ethers";

import { artifacts } from "./artifacts";

export type AddressBookEntry = {
  address: string;
  args?: string[];
  creationCodeHash?: string;
  runtimeCodeHash?: string;
  txHash?: string;
};

export type AddressBookJson = {
  [chainId: string]: {
    [name: string]: AddressBookEntry;
  };
};

export interface AddressBook {
  getContract: (name: string) => Contract;
  getEntry: (name: string) => AddressBookEntry;
  setEntry: (name: string, entry: AddressBookEntry) => void;
}

export const getAddressBook = (
  path: string,
  chainId: string,
  provider?: providers.JsonRpcProvider | Wallet,
): AddressBook => {
  if (!path) throw new Error(`A path to the address book file is required.`);
  if (!chainId) throw new Error(`A chainId is required.`);
  let addressBook: AddressBookJson = { [chainId]: {} };

  try {
    addressBook = JSON.parse(fs.readFileSync(path, "utf8") || "{}") as AddressBookJson;
  } catch (e) {
    if (e.message.includes("ENOENT: no such file")) {
      fs.writeFileSync(path, `{"${chainId}":{}}`);
    } else {
      throw e;
    }
  }

  addressBook = addressBook || {};
  addressBook[chainId] = addressBook[chainId] || {};

  const getEntry = (name: string): AddressBookEntry => {
    try {
      return addressBook[chainId][name] || { address: AddressZero };
    } catch (e) {
      return { address: AddressZero };
    }
  };

  const setEntry = (name: string, entry: AddressBookEntry): void => {
    addressBook[chainId][name] = entry;
    try {
      fs.writeFileSync(path, JSON.stringify(addressBook, null, 2));
    } catch (e) {
      throw Error(`setEntry(${name}, ${JSON.stringify(entry)}): ${e.message}`);
    }
  };

  const getContract = (name: string): Contract => {
    const entry = getEntry(name);
    if (entry.address == AddressZero) {
      throw Error(`getContract(${name}): NO_ADDRESS_BOOK_ENTRY`);
    }
    const artifact = artifacts[name.split("-")[0]];
    if (!artifact || !artifact.abi) {
      throw Error(`getContract(${name}): NO_AVAILABLE_ARTIFACTS`);
    }
    return new Contract(entry.address, artifact.abi, provider);
  };

  return { getContract, getEntry, setEntry };
};
