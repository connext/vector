/* eslint-disable @typescript-eslint/no-empty-function */
import { expect } from "@connext/vector-utils";
import { BigNumber } from "@ethersproject/bignumber";
import { AddressZero, One } from "@ethersproject/constants";
import { Contract } from "@ethersproject/contracts";
import { parseEther } from "@ethersproject/units";

import { deployContracts } from "../../actions";
import { alice, bob } from "../constants";
import { getTestAddressBook, getTestChannel } from "../utils";

describe("CMCDeposit.sol", function() {
  this.timeout(120_000);
  const value = One;
  let channel: Contract;
  let failingToken: Contract;
  let reentrantToken: Contract;

  beforeEach(async () => {
    const addressBook = await getTestAddressBook();
    channel = await getTestChannel(addressBook);
    await deployContracts(alice, addressBook, [
      ["FailingToken", []],
      ["ReentrantToken", [channel.address]],
    ]);
    failingToken = addressBook.getContract("FailingToken");
    reentrantToken = addressBook.getContract("ReentrantToken");
    // mint failing token
    const tx = await failingToken.mint(alice.address, parseEther("0.001"));
    await tx.wait();
    // mint reentrant token
    const tx2 = await reentrantToken.mint(alice.address, parseEther("0.01"));
    await tx2.wait();
  });

  it("should only increase totalDepositsBob after receiving a direct deposit", async () => {
    const aliceDeposits = await channel.getTotalDepositsAlice(AddressZero);
    const bobDeposits = await channel.getTotalDepositsBob(AddressZero);
    const tx = await bob.sendTransaction({ to: channel.address, value });
    await tx.wait();
    expect(await channel.getTotalDepositsAlice(AddressZero)).to.equal(aliceDeposits);
    expect(await channel.getTotalDepositsBob(AddressZero)).to.equal(bobDeposits.add(value));
  });

  it("should only increase totalDepositsAlice after recieving a deposit via method call", async () => {
    const aliceDeposits = await channel.getTotalDepositsAlice(AddressZero);
    const bobDeposits = await channel.getTotalDepositsBob(AddressZero);
    const tx = await channel.connect(alice).depositAlice(AddressZero, value, { value });
    await tx.wait();
    expect(await channel.getTotalDepositsAlice(AddressZero)).to.equal(aliceDeposits.add(value));
    expect(await channel.getTotalDepositsBob(AddressZero)).to.equal(bobDeposits);
  });

  it("depositAlice should fail if the amount doesnt match the value", async () => {
    await expect(channel.depositAlice(AddressZero, value, { value: BigNumber.from(0) })).revertedWith(
      "CMCDeposit: VALUE_MISMATCH",
    );
    expect(await channel.getTotalDepositsAlice(AddressZero)).to.be.eq(0);
  });

  it("should fail if the token transfer fails", async () => {
    expect(await failingToken.balanceOf(alice.address)).to.be.gt(value);
    await expect(channel.depositAlice(failingToken.address, value)).revertedWith("FAIL: Failing token");
    expect(await channel.getTotalDepositsAlice(failingToken.address)).to.be.eq(0);
  });

  it.only("should protect against reentrant tokens", async () => {
    console.log("trying to fetch deposits for the first time");
    expect(await channel.getTotalDepositsAlice(reentrantToken.address)).to.be.eq(0);
    console.log("trying to make failing calls");
    await expect(channel.depositAlice(reentrantToken.address, value)).revertedWith("ReentrancyGuard: REENTRANT_CALL");
    console.log("trying to fetch deposits for the second time");
    expect(await channel.getTotalDepositsAlice(reentrantToken.address)).to.be.eq(0);
    console.log("yay");
  });

});
