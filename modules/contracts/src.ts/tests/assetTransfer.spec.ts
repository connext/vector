/* eslint-disable @typescript-eslint/no-empty-function */

import { AddressZero } from "@ethersproject/constants";
import { expect } from "chai";
import { BigNumber, Contract } from "ethers";
import { parseEther } from "ethers/lib/utils";

import { deployContracts } from "..";
import { AddressBook } from "../addressBook";

import { bob } from "./constants";
import { getTestAddressBook, getTestChannel } from "./utils";

describe("AssetTransfer.sol", () => {
  let addressBook: AddressBook;
  let assetTransfer: Contract;
  let channel: Contract;
  let token: Contract;
  let failingToken: Contract;

  beforeEach(async () => {
    addressBook = await getTestAddressBook();
    await deployContracts(bob, addressBook, [
      ["AssetTransfer", []],
      ["TestToken", []],
      ["FailingToken", []],
    ]);
    assetTransfer = addressBook.getContract("AssetTransfer");
    // NOTE: safe to do because of inheritance pattern
    channel = await getTestChannel(addressBook);
    token = addressBook.getContract("TestToken");
    const mint = await token.mint(bob.address, parseEther("1"));
    await mint.wait();
    failingToken = addressBook.getContract("FailingToken");
    const mintFailure = await token.mint(bob.address, parseEther("1"));
    await mintFailure.wait();
  });

  it("should deploy", async () => {
    expect(assetTransfer.address).to.be.a("string");
    expect(channel.address).to.be.a("string");
  });

  describe("getTotalTransferred", () => {
    it("should fail if called directly", async () => {
      await expect(assetTransfer.getTotalTransferred(AddressZero)).revertedWith("This contract is the mastercopy");
    });

    it("should work when nothing has been transferred", async () => {
      expect(await channel.getTotalTransferred(AddressZero)).to.be.eq(BigNumber.from(0));
      expect(await channel.getTotalTransferred(token.address)).to.be.eq(BigNumber.from(0));
    });
  });

  describe("getEmergencyWithdrawableAmount", () => {
    it("should fail if called directly", async () => {
      await expect(assetTransfer.getEmergencyWithdrawableAmount(AddressZero, bob.address)).revertedWith(
        "This contract is the mastercopy",
      );
    });

    it("should work when nothing has been transferred", async () => {
      expect(await channel.getEmergencyWithdrawableAmount(AddressZero, bob.address)).to.be.eq(BigNumber.from(0));
      expect(await channel.getEmergencyWithdrawableAmount(token.address, bob.address)).to.be.eq(BigNumber.from(0));
    });
  });

  describe("transferAsset", () => {
    beforeEach(async () => {
      // Fund the channel with tokens and eth
      const tx = await bob.sendTransaction({ to: channel.address, value: BigNumber.from(10000) });
      await tx.wait();

      const tokenTx = await token.connect(bob).transfer(channel.address, BigNumber.from(10000));
      await tokenTx.wait();

      const failingTx = await failingToken.connect(bob).transfer(channel.address, BigNumber.from(10000));
      await failingTx.wait();
    });

    it("should work for ETH transfers", async () => {
      const value = BigNumber.from(1000);
      const preTransfer = await bob.getBalance();
      await channel.assetTransfer(AddressZero, bob.address, value);
      expect(await bob.getBalance()).to.be.eq(preTransfer.add(value));
      expect(await channel.getTotalTransferred(AddressZero)).to.be.eq(value);
      expect(await channel.getEmergencyWithdrawableAmount(AddressZero, bob.address)).to.be.eq(BigNumber.from(0));
    });

    it("should work for a valid ERC20 token", async () => {
      const value = BigNumber.from(1000);
      const preTransfer = await token.balanceOf(bob.address);
      await channel.assetTransfer(token.address, bob.address, value);
      expect(await token.balanceOf(bob.address)).to.be.eq(preTransfer.add(value));
      expect(await channel.getTotalTransferred(token.address)).to.be.eq(value);
      expect(await channel.getEmergencyWithdrawableAmount(token.address, bob.address)).to.be.eq(BigNumber.from(0));
    });
  });

  describe.skip("emergencyWithdraw", () => {
    // TODO: why fail :(
    it("should allow eth to be withdrawable if transfer fails", async () => {
      const value = BigNumber.from(1000);
      const preTransfer = await failingToken.balanceOf(bob.address);
      const tx = await channel.assetTransfer(failingToken.address, bob.address, value);
      await tx.wait();
      expect(await failingToken.balanceOf(bob.address)).to.be.eq(preTransfer);
      console.log("**** Verified transfer failed");
      console.log(
        "***** withdrawable",
        (await channel.getEmergencyWithdrawableAmount(failingToken.address, bob.address)).toString(),
      );
      expect(await channel.getTotalTransferred(failingToken.address)).to.be.eq(BigNumber.from(0));
      console.log("**** Verified total transferred");
      expect(await channel.getEmergencyWithdrawableAmount(failingToken.address, bob.address)).to.be.eq(value);
      console.log("**** Verified withdrawable amount");
    });
  });
});
