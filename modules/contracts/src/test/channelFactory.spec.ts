import { getRandomPrivateKey } from "@connext/vector-utils";
import { Contract, ContractFactory, Wallet } from "ethers";

import { Channel, ChannelFactory } from "../artifacts";

import { expect, provider } from "./utils";

describe("ChannelFactory", () => {
  let deployer: Wallet;
  let channelFactory: Contract;

  beforeEach(async () => {
    deployer = (await provider.getWallets())[0];
    const channelMastercopy = await new ContractFactory(
      Channel.abi,
      Channel.bytecode,
      deployer,
    ).deploy();
    await channelMastercopy.deployed();
    channelFactory = await new ContractFactory(
      ChannelFactory.abi,
      ChannelFactory.bytecode,
      deployer,
    ).deploy(channelMastercopy.address);
    await channelFactory.deployed();
  });

  it("should deploy", async () => {
    expect(channelFactory.address).to.be.a("string");
  });

  it("should create a channel", async () => {
    const initiator = new Wallet(getRandomPrivateKey());
    const responder = new Wallet(getRandomPrivateKey());
    // let channelAddress;
    // TODO: wait on channel created event & make sure contract deployed properly
    // channelFactory.once("?", () => {});
    const tx = await channelFactory.createChannel(initiator.address, responder.address);
    await tx.wait();
    expect(tx.hash).to.be.a("string");
  });

});

