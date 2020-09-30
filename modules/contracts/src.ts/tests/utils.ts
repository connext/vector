import { expect } from "@connext/vector-utils";
import { Contract, ContractFactory } from "ethers";

import { ChannelMastercopy, ChannelFactory, VectorChannel } from "../artifacts";

import { alice, bob, provider } from "./constants";

export const createTestChannel = async (): Promise<Contract> => {
  const channelMastercopy = await new ContractFactory(
    ChannelMastercopy.abi,
    ChannelMastercopy.bytecode,
    alice,
  ).deploy();
  await channelMastercopy.deployed();
  const channelFactory = await new ContractFactory(ChannelFactory.abi, ChannelFactory.bytecode, alice).deploy(
    channelMastercopy.address,
  );
  await channelFactory.deployed();
  const doneBeingCreated: Promise<string> = new Promise(res => {
    channelFactory.once(channelFactory.filters.ChannelCreation(), res);
  });
  const chainId = (await provider.getNetwork()).chainId;
  const tx = await channelFactory.createChannel(alice.address, bob.address, chainId);
  expect(tx.hash).to.be.a("string");
  await tx.wait();
  const channelAddress = await doneBeingCreated;
  expect(channelAddress).to.be.a("string");
  return new Contract(channelAddress, VectorChannel.abi, provider);
};
