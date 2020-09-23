/* eslint-disable @typescript-eslint/no-empty-function */
import { Contract } from "ethers";

import { addressZero, initiator, counterparty, rando, one } from "../constants";
import { expect } from "../utils";

import { createChannel } from "./creation.spec";

describe("Channel Deposits", () => {
  let channel: Contract;

  beforeEach(async () => {
    channel = await createChannel();
  });

  it("should accept a direct eth deposit only from the counterparty", async () => {
    const directDeposit = { to: channel.address, value: one };
    await expect(initiator.sendTransaction(directDeposit)).to.be.reverted;
    await expect(rando.sendTransaction(directDeposit)).to.be.reverted;
    const nonceBefore = (await channel.getLatestDeposit(addressZero)).nonce;
    const depositEmitted: Promise<any> = new Promise(res => {
      channel.once(channel.filters.Deposit(), (assetId, amount) => res({ assetId, amount }));
    });
    await expect(counterparty.sendTransaction(directDeposit)).to.be.fulfilled;
    expect(depositEmitted).to.be.fulfilled;
    const depositEvent = await depositEmitted;
    expect(depositEvent.assetId).to.equal(addressZero);
    expect(depositEvent.amount).to.equal(one);
    const latestDeposit = await channel.getLatestDeposit(addressZero);
    expect(latestDeposit.amount).to.equal(one);
    expect(latestDeposit.nonce).to.equal(nonceBefore.add(one));
  });

  it.skip("should accept a token deposit from the counterparty", async () => {});

  it.skip("should accept a direct eth deposit from the initiator", async () => {});

  it.skip("should accept a direct token deposit from the initiator", async () => {});

});
