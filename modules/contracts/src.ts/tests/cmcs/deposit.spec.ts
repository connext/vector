/* eslint-disable @typescript-eslint/no-empty-function */
import { expect } from "@connext/vector-utils";
import { BigNumber } from "@ethersproject/bignumber";
import { AddressZero, One } from "@ethersproject/constants";
import { Contract } from "@ethersproject/contracts";
import { parseEther } from "@ethersproject/units";
import { deployments } from "hardhat";

import { alice, bob } from "../../constants";
import { getContract, createChannel } from "../../utils";

describe("CMCDeposit.sol", function () {
  this.timeout(120_000);
  const value = One;
  let channel: Contract;
  let failingToken: Contract;
  let reentrantToken: Contract;

  beforeEach(async () => {
    await deployments.fixture(); // Start w fresh deployments
    channel = await createChannel();
    // setup failing token
    failingToken = await getContract("FailingToken", alice);
    await (await failingToken.mint(alice.address, parseEther("0.001"))).wait();
    // setup reentrant token
    await deployments.deploy("ReentrantToken", {
      from: alice.address,
      args: [channel.address],
    });

    reentrantToken = await getContract("ReentrantToken", alice);
    await (await reentrantToken.mint(alice.address, parseEther("0.01"))).wait();
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

  it("depositAlice should fail if ETH is sent along with an ERC deposit", async () => {
    await expect(channel.depositAlice(failingToken.address, value, { value: BigNumber.from(10) })).revertedWith(
      "CMCDeposit: ETH_WITH_ERC_TRANSFER",
    );
    expect(await channel.getTotalDepositsAlice(failingToken.address)).to.be.eq(0);
    expect(await channel.getTotalDepositsAlice(AddressZero)).to.be.eq(0);
  });

  it("should fail if the token transfer fails", async () => {
    expect(await failingToken.balanceOf(alice.address)).to.be.gt(value);
    await expect(channel.depositAlice(failingToken.address, value)).revertedWith("FAIL: Failing token");
    expect(await channel.getTotalDepositsAlice(failingToken.address)).to.be.eq(0);
  });

  it("should protect against reentrant tokens", async () => {
    await expect(channel.depositAlice(reentrantToken.address, value)).to.be.revertedWith(
      "ReentrancyGuard: REENTRANT_CALL",
    );
    expect(await channel.getTotalDepositsAlice(reentrantToken.address)).to.be.eq(0);
  });
});
