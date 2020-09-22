import { getRandomChannelSigner, ChannelSigner } from "@connext/vector-utils";
import { Contract, ContractFactory } from "ethers";

import { Adjudicator, ChannelMastercopy, ChannelFactory, VectorChannel } from "../artifacts";

import { expect, provider } from "./utils";

describe("Channel", () => {
  const deployer = provider.getWallets()[0];
  let adjudicator: Contract;
  let channelFactory: Contract;
  let channelMastercopy: Contract;
  let channel: Contract;
  let initiator: ChannelSigner;
  let responder: ChannelSigner;

  beforeEach(async () => {
    adjudicator = await (
      new ContractFactory(Adjudicator.abi, Adjudicator.bytecode, deployer)
    ).deploy();
    await adjudicator.deployed();

    channelMastercopy = await (
      new ContractFactory(ChannelMastercopy.abi, ChannelMastercopy.bytecode, deployer)
    ).deploy();
    await channelMastercopy.deployed();

    channelFactory = await new ContractFactory(ChannelFactory.abi, ChannelFactory.bytecode, deployer).deploy(
      channelMastercopy.address,
      adjudicator.address,
    );
    await channelFactory.deployed();

    // Create a new channel to run tests against
    initiator = getRandomChannelSigner();
    responder = getRandomChannelSigner();
    const created = new Promise((res) => {
      channelFactory.once(channelFactory.filters.ChannelCreation(), res);
    });
    const tx = await channelFactory.createChannel(initiator.address, responder.address);
    expect(tx.hash).to.be.a("string");
    await tx.wait();
    const channelAddress = await created as string;
    expect(channelAddress).to.be.a("string");
    channel = new Contract(channelAddress, VectorChannel.abi, provider);
  });

  it("should deploy without error", async () => {
    expect(channel.address).to.be.a("string");
  });

  it("should return correct participants from getParticipants()", async () => {
    const participants = await channel.getParticipants();
    expect(participants[0]).to.equal(initiator.address);
    expect(participants[1]).to.equal(responder.address);
  });

});

