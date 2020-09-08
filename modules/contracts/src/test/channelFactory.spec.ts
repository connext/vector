import { Contract, ContractFactory, Wallet } from "ethers";

import { ChannelFactory } from "../artifacts";

import { expect, provider } from "./utils";

describe("ChannelFactory", () => {
  let deployer: Wallet;
  let factory: Contract;

  beforeEach(async () => {
    deployer = (await provider.getWallets())[0];
    factory = await new ContractFactory(
      ChannelFactory.abi,
      ChannelFactory.bytecode,
      deployer,
    ).deploy();
    await factory.deployed();
  });

  it("should deploy", async () => {
    expect(factory.address).to.be.a("string");
  });

  it("should create a channel", async () => {
    // factory.
  });

});

