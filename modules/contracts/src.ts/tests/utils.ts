import { BigNumber } from "@ethersproject/bignumber";
import { AddressZero, Zero } from "@ethersproject/constants";
import { Contract } from "@ethersproject/contracts";

import { createChannel, deployContracts } from "../actions";
import { AddressBook, getAddressBook } from "../addressBook";
import { TestChannel, TestToken } from "../artifacts";

import { alice, bob, provider } from "./constants";

// Returns a different address book every time
export const getTestAddressBook = async (): Promise<AddressBook> =>
  getAddressBook(`/tmp/address-book.${Date.now()}.json`, (await provider.getNetwork()).chainId.toString(), alice);

export const getTestChannel = async (_addressBook?: AddressBook): Promise<Contract> => {
  const addressBook = _addressBook || (await getTestAddressBook());
  await deployContracts(alice, addressBook, [
    ["TestChannel", []],
    ["ChannelFactory", ["TestChannel", Zero]],
  ]);
  return createChannel(bob.address, alice, addressBook, undefined, true);
};

export const getUnsetupChannel = async (_addressBook?: AddressBook): Promise<Contract> => {
  const addressBook = _addressBook || (await getTestAddressBook());
  await deployContracts(alice, addressBook, [
    ["TestChannel", []],
    ["TestChannelFactory", ["TestChannel", Zero]],
  ]);
  const testFactory = addressBook.getContract("TestChannelFactory");
  const channelAddress = await testFactory.getChannelAddress(alice.address, bob.address);
  const tx = await testFactory.createChannelWithoutSetup(alice.address, bob.address);
  await tx.wait();
  // Save this channel address in case we need it later
  addressBook.setEntry(`VectorChannel-${alice.address.substring(2, 6)}-${bob.address.substring(2, 6)}`, {
    address: channelAddress,
    args: [alice.address, bob.address],
    txHash: tx.hash,
  });

  return new Contract(channelAddress, TestChannel.abi, alice);
};

export const mineBlock = (): Promise<void> => {
  return new Promise(async resolve => {
    provider.once("block", () => resolve());
    await provider.send("evm_mine", []);
  });
};

export const getOnchainBalance = async (assetId: string, address: string): Promise<BigNumber> => {
  return assetId === AddressZero
    ? provider.getBalance(address)
    : new Contract(assetId, TestToken.abi, provider).balanceOf(address);
};

export const fundAddress = async (address: string, assetId: string, minimumAmt: BigNumber): Promise<void> => {
  const balance = await getOnchainBalance(assetId, address);
  if (balance.gte(minimumAmt)) {
    return;
  }
  const funderBal = await getOnchainBalance(assetId, alice.address);
  if (funderBal.lt(minimumAmt)) {
    throw new Error(
      `${
        alice.address
      } has insufficient funds to gift to ${address} (requested: ${minimumAmt.toString()}, balance: ${funderBal.toString()})`,
    );
  }
  const tx =
    assetId === AddressZero
      ? await alice.sendTransaction({ to: address, value: minimumAmt })
      : await new Contract(assetId, TestToken.abi, alice).transfer(address, minimumAmt);
  await tx.wait();
};
