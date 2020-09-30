import { expect } from "@connext/vector-utils";
import { Contract, ContractFactory } from "ethers";

import { ChannelMastercopy, ChannelFactory, VectorChannel } from "../../artifacts";
import { alice, bob, provider } from "../../constants";

export const createChannel = async (): Promise<Contract> => {
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

describe("Channel Creation", () => {
  let channel: Contract;

  beforeEach(async () => {
    channel = await createChannel();
  });

  it("should be created without error", async () => {
    expect(channel.address).to.be.a("string");
    const runtimeCode = await provider.getCode(channel.address);
    expect(runtimeCode.length).to.be.gt(4);
  });

  it("should return correct participants from getParticipants()", async () => {
    const participants = await channel.getParticipants();
    expect(participants[0]).to.equal(alice.address);
    expect(participants[1]).to.equal(bob.address);
  });
});
