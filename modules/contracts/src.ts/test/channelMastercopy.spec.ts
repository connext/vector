import { getRandomAddress, expect } from "@connext/vector-utils";
import { constants, Contract, ContractFactory } from "ethers";

import { ChannelMastercopy } from "../artifacts";

import { alice } from "./constants";

const { AddressZero, HashZero, Zero } = constants;

describe("ChannelMastercopy", () => {
  let mastercopy: Contract;

  beforeEach(async () => {
    mastercopy = await new ContractFactory(ChannelMastercopy.abi, ChannelMastercopy.bytecode, alice).deploy();
    await mastercopy.deployed();
  });

  it("should deploy without error", async () => {
    expect(mastercopy.address).to.be.a("string");
  });

  it("setup() should revert bc it's the mastercopy", async () => {
    await expect(mastercopy.setup([getRandomAddress(), getRandomAddress()])).to.be.revertedWith(
      "This contract is the mastercopy",
    );
  });

  it("all public methods should revert bc it's the mastercopy", async () => {
    for (const method of [
      { name: "getParticipants", args: [] },
      { name: "withdraw", args: [AddressZero, AddressZero, Zero, Zero, [HashZero]] },
      { name: "depositA", args: [AddressZero, Zero] },
    ]) {
      await expect(mastercopy[method.name](...method.args)).to.be.revertedWith("This contract is the mastercopy");
    }
  });

  it("should revert if sent eth bc it's the mastercopy", async () => {
    await expect(alice.sendTransaction({ to: mastercopy.address, value: Zero })).to.be.revertedWith(
      "This contract is the mastercopy",
    );
  });
});
