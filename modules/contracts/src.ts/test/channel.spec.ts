import {
  ChannelSigner,
  createTestCoreChannelState,
  encodeCoreChannelState,
  hashChannelMessage,
  hashCoreChannelState,
} from "@connext/vector-utils";
import { Contract, ContractFactory } from "ethers";

import { Adjudicator, ChannelMastercopy, ChannelFactory, VectorChannel } from "../artifacts";

import { expect, provider } from "./utils";

describe("Channel", () => {
  const wallets = provider.getWallets();
  const deployer = wallets[0];
  const initiator = new ChannelSigner(deployer.privateKey);
  const counterparty = new ChannelSigner(wallets[1].privateKey);
  let adjudicator: Contract;
  let channel: Contract;
  let channelFactory: Contract;
  let channelMastercopy: Contract;

  beforeEach(async () => {
    adjudicator = await (
      new ContractFactory(Adjudicator.abi, Adjudicator.bytecode, deployer)
    ).deploy();
    await adjudicator.deployed();

    channelMastercopy = await (
      new ContractFactory(ChannelMastercopy.abi, ChannelMastercopy.bytecode, deployer)
    ).deploy();
    await channelMastercopy.deployed();

    channelFactory = await (
      new ContractFactory(ChannelFactory.abi, ChannelFactory.bytecode, deployer)
    ).deploy(
      channelMastercopy.address,
      adjudicator.address,
    );
    await channelFactory.deployed();

    // Create a new channel to run tests against
    const created = new Promise((res) => {
      channelFactory.once(channelFactory.filters.ChannelCreation(), res);
    });
    const tx = await channelFactory.createChannel(counterparty.address);
    expect(tx.hash).to.be.a("string");
    await tx.wait();
    const channelAddress = await created as string;
    expect(channelAddress).to.be.a("string");
    channel = new Contract(channelAddress, ChannelMastercopy.abi, deployer);
  });

  it("should deploy without error", async () => {
    expect(channel.address).to.be.a("string");
  });

  it("should return correct participants from getParticipants()", async () => {
    const participants = await channel.getParticipants();
    expect(participants[0]).to.equal(initiator.address);
    expect(participants[1]).to.equal(counterparty.address);
  });

  it.skip("should successfully start a dispute", async () => {
    const channelState = createTestCoreChannelState({
      participants: [initiator.address, counterparty.address],
    });
    console.log(`Core channel state: ${JSON.stringify(channelState, null, 2)}`);
    const encodedState = encodeCoreChannelState(channelState);
    const hashedState = hashCoreChannelState(channelState);
    const hashedChannelMsg = hashChannelMessage(hashedState);
    console.log(`encodedState: ${encodedState}`);
    console.log(`hashedState: ${hashedState}`);
    console.log(`hashedChannelMsg: ${hashedChannelMsg}`);
    const signatures: string[] = [
      await initiator.signMessage(hashedState),
      await counterparty.signMessage(hashedState),
    ];
    const onchainHash = await channel.hashState(channelState);
    console.log(`onchainHash: ${onchainHash}`);
    expect(onchainHash).to.equal(hashedChannelMsg);
    const res = await channel.disputeChannel(channelState, signatures);
    console.log(`Dispute res: ${JSON.stringify(res, null, 2)}`);
  });

});

