/* eslint-disable @typescript-eslint/no-empty-function */
import { expect } from "@connext/vector-utils";
import { AddressZero, One } from "@ethersproject/constants";
import { Contract } from "ethers";

import { alice, bob } from "../constants";
import { createTestChannel } from "../utils";

describe("CMCDeposit.sol", () => {
  const value = One;
  let channel: Contract;

  beforeEach(async () => {
    channel = await createTestChannel();
  });

  it("should only increase totalDepositedA after receiving a direct deposit", async () => {
    const aliceDeposits = await channel.totalDepositedA(AddressZero);
    const bobDeposits = await channel.totalDepositedB(AddressZero);
    await expect(bob.sendTransaction({ to: channel.address, value })).to.be.fulfilled;
    expect(await channel.totalDepositedA(AddressZero)).to.equal(aliceDeposits);
    expect(await channel.totalDepositedB(AddressZero)).to.equal(bobDeposits.add(value));
  });

  it("should only increase totalDepositedB after recieving a deposit via method call", async () => {
    const aliceDeposits = await channel.totalDepositedA(AddressZero);
    const bobDeposits = await channel.totalDepositedB(AddressZero);
    await expect(channel.connect(alice).depositA(AddressZero, value, { value })).to.be.fulfilled;
    expect(await channel.totalDepositedA(AddressZero)).to.equal(aliceDeposits.add(value));
    expect(await channel.totalDepositedB(AddressZero)).to.equal(bobDeposits);
  });

  it.skip("depositA should fail if the amount doesnt match the value", async () => {});
  it.skip("should fail if the token transfer fails", async () => {});
});
