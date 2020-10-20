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

  it("should only increase totalDepositsAlice after receiving a direct deposit", async () => {
    const aliceDeposits = await channel.getTotalDepositsAlice(AddressZero);
    const bobDeposits = await channel.getTotalDepositsBob(AddressZero);
    await expect(bob.sendTransaction({ to: channel.address, value })).to.be.fulfilled;
    expect(await channel.getTotalDepositsAlice(AddressZero)).to.equal(aliceDeposits);
    expect(await channel.getTotalDepositsBob(AddressZero)).to.equal(bobDeposits.add(value));
  });

  it("should only increase totalDepositsBob after recieving a deposit via method call", async () => {
    const aliceDeposits = await channel.getTotalDepositsAlice(AddressZero);
    const bobDeposits = await channel.getTotalDepositsBob(AddressZero);
    await expect(channel.connect(alice).depositAlice(AddressZero, value, { value })).to.be.fulfilled;
    expect(await channel.getTotalDepositsAlice(AddressZero)).to.equal(aliceDeposits.add(value));
    expect(await channel.getTotalDepositsBob(AddressZero)).to.equal(bobDeposits);
  });

  it.skip("depositA should fail if the amount doesnt match the value", async () => {});
  it.skip("should fail if the token transfer fails", async () => {});
});
