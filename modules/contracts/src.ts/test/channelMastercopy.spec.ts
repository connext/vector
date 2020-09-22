import { getRandomAddress } from "@connext/vector-utils";
import { constants, Contract, ContractFactory } from "ethers";

import { ChannelMastercopy } from "../artifacts";

import { expect, provider } from "./utils";

const { AddressZero, HashZero, Zero } = constants;

describe("ChannelMastercopy", () => {
  const deployer = provider.getWallets()[0];
  let mastercopy: Contract;

  beforeEach(async () => {
    mastercopy = await (
      new ContractFactory(ChannelMastercopy.abi, ChannelMastercopy.bytecode, deployer)
    ).deploy();
    await mastercopy.deployed();
  });

  it("should deploy without error", async () => {
    expect(mastercopy.address).to.be.a("string");
  });

  it("setup() should revert bc it's already setup", async () => {
    await expect(
      mastercopy.setup([getRandomAddress(), getRandomAddress()], getRandomAddress()),
    ).to.be.revertedWith("Channel has already been setup");
  });

  it("all public methods should revert bc it's the mastercopy", async () => {
    for (const method of [
      { name: "depositA", args: [AddressZero, Zero] },
      { name: "execTransaction", args: [AddressZero, Zero, HashZero, Zero, [HashZero]] },
      { name: "getBalance", args: [AddressZero] },
      { name: "getParticipants", args: [] },
      { name: "getLatestDeposit", args: [AddressZero] },
      { name: "managedTransfer", args: [[[Zero, Zero], [AddressZero, AddressZero]], AddressZero] },
    ]) {
      await expect(
        mastercopy[method.name](...method.args),
      ).to.be.revertedWith("This contract is the mastercopy");
    }
  });

  it("should revert if sent eth bc it's the mastercopy", async () => {
    await expect(
      deployer.sendTransaction({ to: mastercopy.address, value: Zero }),
    ).to.be.revertedWith("This contract is the mastercopy");
  });

});
