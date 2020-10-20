import { expect } from "@connext/vector-utils";
import { Contract } from "ethers";

import { deployContracts } from "../actions";
import { AddressBook, getAddressBook } from "../addressBook";
import { VectorChannel } from "../artifacts";

import { addressBookPath, alice, bob, provider } from "./constants";

// Returns a different address book every time
export const getTestAddressBook = async (): Promise<AddressBook> => getAddressBook(
  addressBookPath.replace(".json", `.${Date.now()}.json`),
  (await provider.getNetwork()).chainId.toString(),
  alice,
);

export const createTestChannel = async (_addressBook?: AddressBook): Promise<Contract> => {
  const addressBook = _addressBook || await getTestAddressBook();
  await deployContracts(alice, addressBook, [
    ["ChannelMastercopy", []],
    ["ChannelFactory", ["ChannelMastercopy"]],
  ]);
  const channelFactory = addressBook.getContract("ChannelFactory");
  const doneBeingCreated: Promise<string> = new Promise(res => {
    // NOTE: this takes kind of a long time to resolve.. is there any way to speed it up?
    channelFactory.once(channelFactory.filters.ChannelCreation(), res);
  });
  const chainId = (await provider.getNetwork()).chainId;
  await (await channelFactory.createChannel(alice.address, bob.address, chainId)).wait();
  const channelAddress = await doneBeingCreated;
  expect(channelAddress).to.be.a("string");
  return new Contract(channelAddress, VectorChannel.abi, alice);
};
