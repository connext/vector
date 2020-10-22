import { Contract } from "ethers";

import { createChannel, deployContracts } from "../actions";
import { AddressBook, getAddressBook } from "../addressBook";

import { alice, bob, provider } from "./constants";

// Returns a different address book every time
export const getTestAddressBook = async (): Promise<AddressBook> =>
  getAddressBook(`/tmp/address-book.${Date.now()}.json`, (await provider.getNetwork()).chainId.toString(), alice);

export const getTestChannel = async (_addressBook?: AddressBook): Promise<Contract> => {
  const addressBook = _addressBook || (await getTestAddressBook());
  await deployContracts(alice, addressBook, [
    ["TestChannel", []],
    ["ChannelFactory", ["TestChannel"]],
  ]);
  return createChannel(bob.address, alice, addressBook, undefined, true);
};
