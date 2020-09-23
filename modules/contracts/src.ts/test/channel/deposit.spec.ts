/* eslint-disable @typescript-eslint/no-empty-function */
import { Contract } from "ethers";

import { addressZero, initiator, counterparty, rando, one } from "../constants";
import { expect } from "../utils";

import { createChannel } from "./creation.spec";

describe("Channel Deposits", () => {
  let channel: Contract;
  let amount = one;

  beforeEach(async () => {
    channel = await createChannel();
  });

  it("should only accept a direct eth deposit from the counterparty", async () => {
    const assetId = addressZero;
    const directDeposit = { to: channel.address, value: one };
    await expect(initiator.sendTransaction(directDeposit)).to.be.reverted;
    await expect(rando.sendTransaction(directDeposit)).to.be.reverted;
    const nonceBefore = (await channel.getLatestDeposit(assetId)).nonce;
    const depositEmitted: Promise<any> = new Promise(res => {
      channel.once(channel.filters.Deposit(), (assetId, amount) => res({ assetId, amount }));
    });
    await expect(counterparty.sendTransaction(directDeposit)).to.be.fulfilled;
    expect(depositEmitted).to.be.fulfilled;
    const depositEvent = await depositEmitted;
    expect(depositEvent.assetId).to.equal(assetId);
    expect(depositEvent.amount).to.equal(one);
    const latestDeposit = await channel.getLatestDeposit(assetId);
    expect(latestDeposit.amount).to.equal(one);
    expect(latestDeposit.nonce).to.equal(nonceBefore.add(one));
  });

  it("should only accept an eth deposit via contract method from the initiator", async () => {
    const assetId = addressZero;
    const depositTx = await channel.populateTransaction.initiatorDeposit(assetId, one, {
      value: one,
    });
    await expect(counterparty.sendTransaction(depositTx)).to.be.reverted;
    await expect(rando.sendTransaction(depositTx)).to.be.reverted;
    const nonceBefore = (await channel.getLatestDeposit(assetId)).nonce;
    const depositEmitted: Promise<any> = new Promise(res => {
      channel.once(channel.filters.Deposit(), (assetId, amount) => res({ assetId, amount }));
    });
    await expect(initiator.sendTransaction(depositTx)).to.be.fulfilled;
    expect(depositEmitted).to.be.fulfilled;
    const depositEvent = await depositEmitted;
    expect(depositEvent.assetId).to.equal(assetId);
    expect(depositEvent.amount).to.equal(one);
    const latestDeposit = await channel.getLatestDeposit(assetId);
    expect(latestDeposit.amount).to.equal(one);
    expect(latestDeposit.nonce).to.equal(nonceBefore.add(one));
  });

});
