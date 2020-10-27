import { Contract } from "ethers";

import { createChannel, deployContracts } from "../actions";
import { AddressBook, getAddressBook } from "../addressBook";
import { TestChannel } from "../artifacts";

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

export const getUnsetupChannel = async (_addressBook?: AddressBook): Promise<Contract> => {
  const addressBook = _addressBook || (await getTestAddressBook());
  await deployContracts(alice, addressBook, [
    ["TestChannel", []],
    ["TestChannelFactory", ["TestChannel"]],
  ]);
  const factory = addressBook.getContract("TestChannelFactory");
  const doneBeingCreated: Promise<string> = new Promise(res => {
    // NOTE: this takes kind of a long time to resolve.. is there any way to speed it up?
    factory.once(factory.filters.ChannelCreation(), res);
  });
  const chainId = (await alice.provider.getNetwork()).chainId.toString();
  const tx = await factory.createChannelWithoutSetup(alice.address, bob.address, chainId);
  await tx.wait();
  const channelAddress = await doneBeingCreated;
  // Save this channel address in case we need it later
  addressBook.setEntry(`VectorChannel-${alice.address.substring(2, 6)}-${bob.address.substring(2, 6)}`, {
    address: channelAddress,
    args: [alice.address, bob.address, chainId],
    txHash: tx.hash,
  });

  return new Contract(channelAddress, TestChannel.abi, alice);
};
