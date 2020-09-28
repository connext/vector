/* eslint-disable @typescript-eslint/no-empty-function */
import { expect } from "@connext/vector-utils";
import { Contract } from "ethers";

import { addressZero, alice, bob, one } from "../constants";

import { createChannel } from "./creation.spec";

describe("Channel Deposits", () => {
  const value = one;
  let channel: Contract;

  beforeEach(async () => {
    channel = await createChannel();
  });

  it("should only increase totalDepositedA after receiving a direct deposit", async () => {
    const aliceDeposits = await channel.totalDepositedA(addressZero);
    const bobDeposits = await channel.totalDepositedB(addressZero);
    await expect(bob.sendTransaction({ to: channel.address, value })).to.be.fulfilled;
    expect(await channel.totalDepositedA(addressZero)).to.equal(aliceDeposits);
    expect(await channel.totalDepositedB(addressZero)).to.equal(bobDeposits.add(value));
  });

  it("should only increase totalDepositedB after recieving a deposit via method call", async () => {
    const aliceDeposits = await channel.totalDepositedA(addressZero);
    const bobDeposits = await channel.totalDepositedB(addressZero);
    await expect(channel.connect(alice).depositA(addressZero, value, { value })).to.be.fulfilled;
    expect(await channel.totalDepositedA(addressZero)).to.equal(aliceDeposits.add(value));
    expect(await channel.totalDepositedB(addressZero)).to.equal(bobDeposits);
  });
});
