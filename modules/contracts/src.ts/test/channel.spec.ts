import { Contract, ContractFactory, Wallet } from "ethers";

import { VectorChannel } from "../artifacts";
import { expect, provider } from "./utils";

describe("VectorChannel", () => {
  let deployer: Wallet;
  let channel: Contract;

  beforeEach(async () => {
    deployer = provider.getWallets()[0];
    channel = await new ContractFactory(VectorChannel.abi, VectorChannel.bytecode, deployer).deploy();
    await channel.deployed();
  });

  it("should deploy", async () => {
    expect(channel.address).to.be.a("string");
  });
});
