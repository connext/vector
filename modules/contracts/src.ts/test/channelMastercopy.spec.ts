import { Contract, ContractFactory, Wallet } from "ethers";

import { ChannelMastercopy } from "../artifacts";

import { expect, provider } from "./utils";

describe("ChannelMastercopy", () => {
  let deployer: Wallet;
  let mastercopy: Contract;

  beforeEach(async () => {
    deployer = provider.getWallets()[0];
    mastercopy = await new ContractFactory(ChannelMastercopy.abi, ChannelMastercopy.bytecode, deployer).deploy();
    await mastercopy.deployed();
  });

  it("should deploy without error", async () => {
    expect(mastercopy.address).to.be.a("string");
  });

  it("should not be possible to set it up", async () => {
    await expect(
      mastercopy.setup([provider.getWallets()[1], provider.getWallets()[2]], provider.getWallets()[3]),
    ).to.be.reverted;
  });

});
