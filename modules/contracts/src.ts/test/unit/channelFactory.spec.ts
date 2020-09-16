import { getRandomPrivateKey } from "@connext/vector-utils";
import { Contract, ContractFactory, Wallet } from "ethers";

import { Adjudicator, VectorChannel, ChannelFactory } from "../../artifacts";
import { expect, provider } from "../utils";

describe("ChannelFactory", () => {
  let deployer: Wallet;
  let channelFactory: Contract;

  beforeEach(async () => {
    deployer = (await provider.getWallets())[0];
    const adjudicator = await new ContractFactory(Adjudicator.abi, Adjudicator.bytecode, deployer).deploy();
    await adjudicator.deployed();

    const channelMastercopy = await new ContractFactory(VectorChannel.abi, VectorChannel.bytecode, deployer).deploy();
    await channelMastercopy.deployed();

    channelFactory = await new ContractFactory(ChannelFactory.abi, ChannelFactory.bytecode, deployer).deploy(
      channelMastercopy.address,
      adjudicator.address,
    );
    await channelFactory.deployed();
  });

  it("should deploy", async () => {
    expect(channelFactory.address).to.be.a("string");
  });

  it("should create a channel", async () => {
    const initiator = new Wallet(getRandomPrivateKey());
    const responder = new Wallet(getRandomPrivateKey());
    const created = new Promise((res) => {
      channelFactory.once(channelFactory.filters.ChannelCreation(), (data) => {
        // console.log(`Detected a new ChannelCreation event: ${JSON.stringify(data)}`);
        res(data);
      });
    });
    const tx = await channelFactory.createChannel(initiator.address, responder.address);
    expect(tx.hash).to.be.a("string");
    await tx.wait();
    const channelAddress = await created;
    expect(channelAddress).to.be.a("string");
  });
});
