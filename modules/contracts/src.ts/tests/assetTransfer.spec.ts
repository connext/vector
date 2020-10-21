/* eslint-disable @typescript-eslint/no-empty-function */

import { AddressZero } from "@ethersproject/constants";
import { expect } from "chai";
import { BigNumber, Contract } from "ethers";

import { deployContracts } from "..";
import { AddressBook } from "../addressBook";

import { alice, bob } from "./constants";
import { getTestAddressBook, getTestChannel } from "./utils";

// TODO: best way to test this?
describe("AssetTransfer.sol", () => {
  let addressBook: AddressBook;
  let assetTransfer: Contract;
  let channel: Contract;

  before(async () => {
    addressBook = await getTestAddressBook();
    await deployContracts(bob, addressBook, [["AssetTransfer", []]]);
    assetTransfer = addressBook.getContract("AssetTransfer");
    // NOTE: safe to do because of inheritance pattern
    channel = await getTestChannel(addressBook);
  });

  it("should deploy", async () => {
    expect(assetTransfer.address).to.be.a("string");
  });

  // TODO: how to change total transferred from test?
  describe("getTotalTransferred", () => {
    it("should fail if called directly", async () => {
      await expect(assetTransfer.getTotalTransferred(AddressZero)).revertedWith("This contract is the mastercopy");
    });

    // TODO: should you be able to call this on the channel?
    it.skip("should work", async () => {
      expect(await channel.getTotalTransferred(AddressZero)).to.be.eq(BigNumber.from(0));
    });
  });

  // TODO: how to change withdrawal amount from test?
  describe("getEmergencyWithdrawableAmount", () => {
    it("should fail if called directly", async () => {
      await expect(assetTransfer.getEmergencyWithdrawableAmount(AddressZero, bob.address)).revertedWith(
        "This contract is the mastercopy",
      );
    });

    // TODO: should you be able to call this on the channel?
    it.skip("should work", async () => {
      expect(await channel.getEmergencyWithdrawableAmount(AddressZero, bob.address)).to.be.eq(BigNumber.from(0));
    });
  });

  // TODO: how to change withdrawal amount from test?
  describe.skip("emergencyWithdraw", () => {
    it("should work", async () => {});
  });
});
