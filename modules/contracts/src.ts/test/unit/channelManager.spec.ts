import { getRandomPrivateKey } from "@connext/vector-utils";
import { Contract, ContractFactory, Wallet } from "ethers";

import { VectorChannel, ChannelManager } from "../../artifacts";
import { expect, provider } from "../utils";

describe("ChannelManager", () => {
  let deployer: Wallet;
  let channelManager: Contract;

  beforeEach(async () => {
    deployer = (await provider.getWallets())[0];

    const channelMastercopy = await new ContractFactory(VectorChannel.abi, VectorChannel.bytecode, deployer).deploy();
    await channelMastercopy.deployed();

    channelManager = await new ContractFactory(ChannelManager.abi, ChannelManager.bytecode, deployer).deploy(
      channelMastercopy.address,
    );
    await channelManager.deployed();
  });

  it("should deploy", async () => {
    expect(channelManager.address).to.be.a("string");
  });

  it("should create a channel", async () => {
    const initiator = new Wallet(getRandomPrivateKey());
    const responder = new Wallet(getRandomPrivateKey());
    const created = new Promise((res) => {
      channelManager.once(channelManager.filters.ChannelCreation(), (data) => {
        // console.log(`Detected a new ChannelCreation event: ${JSON.stringify(data)}`);
        res(data);
      });
    });
    const tx = await channelManager.createChannel(initiator.address, responder.address);
    expect(tx.hash).to.be.a("string");
    await tx.wait();
    const channelAddress = await created;
    expect(channelAddress).to.be.a("string");
  });
});
