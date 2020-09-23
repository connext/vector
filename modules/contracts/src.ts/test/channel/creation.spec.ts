import { Contract, ContractFactory } from "ethers";

import { ChannelMastercopy, ChannelFactory, VectorChannel } from "../../artifacts";
import { initiator, counterparty, provider } from "../constants";
import { expect } from "../utils";

export const createChannel = async (): Promise<Contract> => {
    const channelMastercopy = await (
      new ContractFactory(ChannelMastercopy.abi, ChannelMastercopy.bytecode, initiator)
    ).deploy();
    await channelMastercopy.deployed();
    const channelFactory = await (
      new ContractFactory(ChannelFactory.abi, ChannelFactory.bytecode, initiator)
    ).deploy(
      channelMastercopy.address,
    );
    await channelFactory.deployed();
    const doneBeingCreated: Promise<string> = new Promise((res) => {
      channelFactory.once(channelFactory.filters.ChannelCreation(), res);
    });
    const tx = await channelFactory.createChannel(
      initiator.address,
      counterparty.address,
    );
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
    expect(participants[0]).to.equal(initiator.address);
    expect(participants[1]).to.equal(counterparty.address);
  });
});
