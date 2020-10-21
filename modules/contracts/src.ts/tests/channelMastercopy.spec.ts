import { getRandomAddress, expect } from "@connext/vector-utils";
import { AddressZero, HashZero, Zero } from "@ethersproject/constants";
import { Contract } from "ethers";

import { deployContracts } from "../actions";
import { AddressBook } from "../addressBook";

import { alice } from "./constants";
import { getTestAddressBook } from "./utils";

describe("ChannelMastercopy", () => {
  let addressBook: AddressBook;
  let mastercopy: Contract;

  beforeEach(async () => {
    addressBook = await getTestAddressBook();
    await deployContracts(alice, addressBook, [["ChannelMastercopy", []]]);
    mastercopy = addressBook.getContract("ChannelMastercopy");
  });

  it("should deploy without error", async () => {
    expect(mastercopy.address).to.be.a("string");
  });

  it("setup() should revert bc it's the mastercopy", async () => {
    await expect(
      mastercopy.setup(getRandomAddress(), getRandomAddress()),
   ).to.be.revertedWith("This contract is the mastercopy");
  });

  it("all public methods should revert bc it's the mastercopy", async () => {
    const BalanceZero = [
      [Zero, Zero],
      [AddressZero, AddressZero],
    ];
    const CoreChannelStateZero = [[], [], AddressZero, AddressZero, AddressZero, [], [], Zero, Zero, HashZero];
    const CoreTransferStateZero = [
      BalanceZero,
      AddressZero,
      AddressZero,
      HashZero,
      AddressZero,
      Zero,
      HashZero,
      AddressZero,
      AddressZero,
    ];
    for (const method of [
      { name: "getAlice", args: [] },
      { name: "getBob", args: [] },
      { name: "getMastercopy", args: [] },
      { name: "withdraw", args: [AddressZero, AddressZero, Zero, Zero, HashZero, HashZero] },
      { name: "depositAlice", args: [AddressZero, Zero] },
      { name: "getChannelDispute", args: [] },
      { name: "getTransferDispute", args: [HashZero] },
      { name: "disputeChannel", args: [CoreChannelStateZero, "0x", "0x"] },
      { name: "defundChannel", args: [CoreChannelStateZero] },
      { name: "disputeTransfer", args: [CoreTransferStateZero, []] },
      { name: "defundTransfer", args: [CoreTransferStateZero, "0x", "0x"] },
    ]) {
      await expect(
        mastercopy[method.name](...method.args),
      ).to.be.revertedWith("This contract is the mastercopy");
    }
  });

  it("should revert if sent eth bc it's the mastercopy", async () => {
    await expect(
      alice.sendTransaction({ to: mastercopy.address, value: Zero }),
    ).to.be.revertedWith("This contract is the mastercopy");
  });
});
