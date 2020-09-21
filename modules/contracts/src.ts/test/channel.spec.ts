import { Contract, ContractFactory, Wallet } from "ethers";

import { ChannelMastercopy } from "../artifacts";
import { expect, provider } from "./utils";

describe("ChannelMastercopy", () => {
  let deployer: Wallet;
  let channel: Contract;

  beforeEach(async () => {
    deployer = provider.getWallets()[0];
    channel = await new ContractFactory(ChannelMastercopy.abi, ChannelMastercopy.bytecode, deployer).deploy();
    await channel.deployed();
  });

  it("should deploy", async () => {
    expect(channel.address).to.be.a("string");
  });
});
