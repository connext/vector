import { Contract, ContractFactory, Wallet } from "ethers";

import { Channel } from "../artifacts";

import { expect, provider } from "./utils";

describe("Channel", () => {
  let deployer: Wallet;
  let channel: Contract;

  beforeEach(async () => {
    deployer = (await provider.getWallets())[0];
    channel = await new ContractFactory(
      Channel.abi,
      Channel.bytecode,
      deployer,
    ).deploy();
    await channel.deployed();
  });

  it("should deploy", async () => {
    expect(channel.address).to.be.a("string");
  });

});
