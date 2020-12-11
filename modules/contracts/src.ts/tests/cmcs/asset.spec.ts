/* eslint-disable @typescript-eslint/no-empty-function */
import { Balance } from "@connext/vector-types";
import { BigNumber } from "@ethersproject/bignumber";
import { AddressZero, Zero } from "@ethersproject/constants";
import { Contract } from "@ethersproject/contracts";
import { parseEther } from "@ethersproject/units";
import { expect } from "chai";
import { deployments } from "hardhat";

import { getContract } from "../../utils";
import { alice, bob, rando } from "../constants";
import { getTestChannel } from "../utils";

describe("CMCAsset", function () {
  this.timeout(120_000);
  let assetTransfer: Contract;
  let channel: Contract;
  let token: Contract;
  let failingToken: Contract;
  let nonconformingToken: Contract;

  beforeEach(async () => {
    await deployments.fixture(); // Start w fresh deployments
    assetTransfer = await getContract("CMCAsset", alice);
    // NOTE: safe to do because of inheritance pattern
    channel = await getTestChannel();

    // Fund with all tokens
    token = await getContract("TestToken", alice);
    const mint = await token.mint(bob.address, parseEther("1"));
    await mint.wait();

    failingToken = await getContract("FailingToken", alice);
    const mintFailure = await failingToken.mint(bob.address, parseEther("1"));
    await mintFailure.wait();

    nonconformingToken = await getContract("NonconformingToken", alice);
    const mintNonconforming = await nonconformingToken.mint(bob.address, parseEther("1"));
    await mintNonconforming.wait();
  });

  it("should deploy", async () => {
    expect(assetTransfer.address).to.be.a("string");
    expect(channel.address).to.be.a("string");
  });

  describe("getTotalTransferred", () => {
    it("should fail if called directly", async () => {
      await expect(assetTransfer.getTotalTransferred(AddressZero)).revertedWith("Mastercopy: ONLY_VIA_PROXY");
    });

    it("should work when nothing has been transferred", async () => {
      expect(await channel.getTotalTransferred(AddressZero)).to.be.eq(BigNumber.from(0));
      expect(await channel.getTotalTransferred(token.address)).to.be.eq(BigNumber.from(0));
    });
  });

  describe("getExitableAmount", () => {
    it("should fail if called directly", async () => {
      await expect(assetTransfer.getExitableAmount(AddressZero, bob.address)).revertedWith(
        "Mastercopy: ONLY_VIA_PROXY",
      );
    });

    it("should work when nothing has been transferred", async () => {
      expect(await channel.getExitableAmount(AddressZero, bob.address)).to.be.eq(BigNumber.from(0));
      expect(await channel.getExitableAmount(token.address, bob.address)).to.be.eq(BigNumber.from(0));
    });
  });

  describe("makeExitable", () => {
    beforeEach(async () => {
      // Fund the channel with tokens and eth
      const tx = await bob.sendTransaction({ to: channel.address, value: BigNumber.from(10000) });
      await tx.wait();

      const tokenTx = await token.connect(bob).transfer(channel.address, BigNumber.from(10000));
      await tokenTx.wait();

      const nonconforming = await nonconformingToken.connect(bob).transfer(channel.address, BigNumber.from(10000));
      await nonconforming.wait();
    });

    it("should work for ETH transfers", async () => {
      const value = BigNumber.from(1000);
      const preTransfer = await bob.getBalance();
      await channel.testMakeExitable(AddressZero, bob.address, value);
      expect(await bob.getBalance()).to.be.eq(preTransfer);
      expect(await channel.getTotalTransferred(AddressZero)).to.be.eq(Zero);
      expect(await channel.getExitableAmount(AddressZero, bob.address)).to.be.eq(value);
    });

    it("should work for a valid ERC20 token", async () => {
      const value = BigNumber.from(1000);
      const preTransfer = await token.balanceOf(bob.address);
      await channel.testMakeExitable(token.address, bob.address, value);
      expect(await token.balanceOf(bob.address)).to.be.eq(preTransfer);
      expect(await channel.getTotalTransferred(token.address)).to.be.eq(Zero);
      expect(await channel.getExitableAmount(token.address, bob.address)).to.be.eq(value);
    });

    it("should work for ERC20 token that does not return `bool` from transfer", async () => {
      const value = BigNumber.from(1000);
      const preTransfer = await nonconformingToken.balanceOf(bob.address);
      await channel.testMakeExitable(nonconformingToken.address, bob.address, value);
      expect(await nonconformingToken.balanceOf(bob.address)).to.be.eq(preTransfer);
      expect(await channel.getTotalTransferred(nonconformingToken.address)).to.be.eq(Zero);
      expect(await channel.getExitableAmount(nonconformingToken.address, bob.address)).to.be.eq(value);
    });
  });

  describe("makeBalanceExitable", () => {
    beforeEach(async () => {
      // Fund the channel with tokens and eth
      const tx = await bob.sendTransaction({ to: channel.address, value: BigNumber.from(10000) });
      await tx.wait();
    });

    it("should work", async () => {
      const valueBob = BigNumber.from(1000);
      const valueRando = BigNumber.from(2000);
      const balance: Balance = {
        to: [bob.address, rando.address],
        amount: [valueBob.toString(), valueRando.toString()],
      };
      const preTransferBob = await bob.getBalance();
      const preTransferRando = await rando.getBalance();
      await channel.testMakeBalanceExitable(AddressZero, balance);
      expect(await bob.getBalance()).to.be.eq(preTransferBob);
      expect(await rando.getBalance()).to.be.eq(preTransferRando);
      expect(await channel.getTotalTransferred(AddressZero)).to.be.eq(Zero);
      expect(await channel.getExitableAmount(AddressZero, bob.address)).to.be.eq(valueBob);
      expect(await channel.getExitableAmount(AddressZero, rando.address)).to.be.eq(valueRando);
    });
  });

  describe("exit", () => {
    const value = BigNumber.from(1000);

    beforeEach(async () => {
      // Fund the channel with tokens and eth
      const fund = value.mul(10);
      await (await bob.sendTransaction({ to: channel.address, value: fund })).wait();
      await (await failingToken.connect(bob).succeedingTransfer(channel.address, fund)).wait();

      // Make failing transfer
      const preTransfer = await failingToken.balanceOf(bob.address);
      await (await channel.testMakeExitable(failingToken.address, bob.address, value)).wait();
      expect(await failingToken.balanceOf(bob.address)).to.be.eq(preTransfer);
      expect(await channel.getTotalTransferred(failingToken.address)).to.be.eq(BigNumber.from(0));
      expect(await channel.getExitableAmount(failingToken.address, bob.address)).to.be.eq(value);

      // Make transfers pass
      await (await failingToken.setTransferShouldRevert(false)).wait();
      await (await failingToken.setTransferShouldFail(false)).wait();
    });

    it("should fail if owner is not msg.sender or recipient", async () => {
      await expect(channel.connect(rando).exit(failingToken.address, bob.address, rando.address)).revertedWith(
        "CMCAsset: OWNER_MISMATCH",
      );
    });

    it("should fail if withdrawable amount is 0", async () => {
      await expect(channel.connect(bob).exit(token.address, bob.address, bob.address)).revertedWith("CMCAsset: NO_OP");
    });

    it("should fail if transfer fails", async () => {
      await (await failingToken.setTransferShouldFail(true)).wait();
      await expect(channel.connect(bob).exit(failingToken.address, bob.address, bob.address)).revertedWith(
        "CMCAsset: TRANSFER_FAILED",
      );
    });

    it("should fail if transfer reverts", async () => {
      await (await failingToken.setTransferShouldRevert(true)).wait();
      await expect(channel.connect(bob).exit(failingToken.address, bob.address, bob.address)).revertedWith(
        "FAIL: Failing token",
      );
    });

    it("should allow ERC20 token to be withdrawable if transfer fails", async () => {
      const preTransfer = await failingToken.balanceOf(bob.address);
      await (await channel.exit(failingToken.address, bob.address, bob.address)).wait();
      expect(await failingToken.balanceOf(bob.address)).to.be.eq(preTransfer.add(value));
    });
  });
});
