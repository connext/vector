import { Contract, ContractFactory, Wallet } from "ethers";

import { Adjudicator, Channel } from "../artifacts";

import { expect, provider } from "./utils";

describe("Channel", () => {
  let deployer: Wallet;
  let adjudicator: Contract;
  let channel: Contract;

  beforeEach(async () => {
    deployer = (await provider.getWallets())[0];
    adjudicator = await new ContractFactory(
      Adjudicator.abi,
      Adjudicator.bytecode,
      deployer,
    ).deploy();
    await adjudicator.deployed();

    channel = await new ContractFactory(
      Channel.abi,
      Channel.bytecode,
      deployer,
    ).deploy();
    await channel.deployed();
  });

  it("should be deployable", async () => {
    expect(channel.address).to.be.a("string");
  });

});
