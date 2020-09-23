/* eslint-disable @typescript-eslint/no-empty-function */
import { Contract } from "ethers";

import { addressZero, initiator, counterparty, rando, one } from "../constants";
import { expect } from "../utils";

import { createChannel } from "./creation.spec";

// TODO: test token deposits
describe("Channel Deposits", () => {
  const value = one;
  let channel: Contract;

  beforeEach(async () => {
    channel = await createChannel();
  });

  it("should only accept a direct eth deposit from the counterparty", async () => {
    const assetId = addressZero;
    const directDeposit = { to: channel.address, value };
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
    expect(depositEvent.amount).to.equal(value);
    const latestDeposit = await channel.getLatestDeposit(assetId);
    expect(latestDeposit.amount).to.equal(value);
    expect(latestDeposit.nonce).to.equal(nonceBefore.add(value));
  });

  it("should only accept an eth deposit via contract method from the initiator", async () => {
    const assetId = addressZero;
    const depositTx = await channel.populateTransaction.initiatorDeposit(assetId, value, { value });
    // TODO: do we want to protect this method from being called by randos?
    // If so, we need some way to also allow the factory to call this during create & deposit
    // await expect(counterparty.sendTransaction(depositTx)).to.be.reverted;
    // await expect(rando.sendTransaction(depositTx)).to.be.reverted;
    const nonceBefore = (await channel.getLatestDeposit(assetId)).nonce;
    const depositEmitted: Promise<any> = new Promise(res => {
      channel.once(channel.filters.Deposit(), (assetId, amount) => res({ assetId, amount }));
    });
    await expect(initiator.sendTransaction(depositTx)).to.be.fulfilled;
    expect(depositEmitted).to.be.fulfilled;
    const depositEvent = await depositEmitted;
    expect(depositEvent.assetId).to.equal(assetId);
    expect(depositEvent.amount).to.equal(value);
    const latestDeposit = await channel.getLatestDeposit(assetId);
    expect(latestDeposit.amount).to.equal(value);
    expect(latestDeposit.nonce).to.equal(nonceBefore.add(value));
  });

});
