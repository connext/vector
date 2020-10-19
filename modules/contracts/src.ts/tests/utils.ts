import { expect } from "@connext/vector-utils";
import { Contract, ContractFactory } from "ethers";

import { ChannelMastercopy, ChannelFactory, VectorChannel, TransferRegistry, Withdraw } from "../artifacts";

import { alice, bob, provider } from "./constants";

export const createTestChannelFactory = async (deployedChannelMastercopy?: Contract): Promise<Contract> => {
  const channelMastercopy = deployedChannelMastercopy ?? (await createTestChannelMastercopy());
  const channelFactory = await new ContractFactory(ChannelFactory.abi, ChannelFactory.bytecode, alice).deploy(
    channelMastercopy.address,
  );
  await channelFactory.deployed();
  return new Contract(channelFactory.address, ChannelFactory.abi, alice);
};

export const createTestChannelMastercopy = async (): Promise<Contract> => {
  const channelMastercopy = await new ContractFactory(
    ChannelMastercopy.abi,
    ChannelMastercopy.bytecode,
    alice,
  ).deploy();
  await channelMastercopy.deployed();
  return new Contract(channelMastercopy.address, ChannelMastercopy.abi, alice);
};

export const createTestChannel = async (deployedChannelFactory?: Contract): Promise<Contract> => {
  const channelFactory = deployedChannelFactory ?? (await createTestChannelFactory());
  const doneBeingCreated: Promise<string> = new Promise(res => {
    channelFactory.once(channelFactory.filters.ChannelCreation(), res);
  });
  const chainId = (await provider.getNetwork()).chainId;
  const tx = await channelFactory.createChannel(alice.address, bob.address, chainId);
  expect(tx.hash).to.be.a("string");
  await tx.wait();
  const channelAddress = await doneBeingCreated;
  expect(channelAddress).to.be.a("string");
  return new Contract(channelAddress, VectorChannel.abi, alice);
};

export const createTestWithdraw = async (): Promise<Contract> => {
  const withdraw = await new ContractFactory(Withdraw.abi, Withdraw.bytecode, alice).deploy();
  await withdraw.deployed();

  return new Contract(withdraw.address, Withdraw.abi, alice);
};

export const createTestTransferRegistry = async (): Promise<Contract> => {
  const transferRegistry = await new ContractFactory(TransferRegistry.abi, TransferRegistry.bytecode, alice).deploy();
  await transferRegistry.deployed();

  // add transfer to registry
  const withdraw = await createTestWithdraw();
  const deployed = new Contract(transferRegistry.address, TransferRegistry.abi, alice);

  const response = await deployed.addTransferDefinition(await withdraw.getRegistryInformation());
  await response.wait();

  return deployed;
};
