/* eslint-disable @typescript-eslint/no-empty-function */
import { Contract } from "ethers";

import { addressZero, alice, bob, one } from "../constants";
import { expect } from "../utils";

import { createChannel } from "./creation.spec";

// TODO: test token deposits
describe("Channel Deposits", () => {
  const value = one;
  let channel: Contract;

  beforeEach(async () => {
    channel = await createChannel();
  });

  it("should accept a direct eth deposit without recording anything", async () => {
    const assetId = addressZero;
    const directDeposit = { to: channel.address, value };
    const latestDepositBefore = await channel.getLatestDeposit(assetId);
    await expect(bob.sendTransaction(directDeposit)).to.be.fulfilled;
    const latestDepositAfter = await channel.getLatestDeposit(assetId);
    expect(latestDepositBefore.nonce).to.equal(latestDepositAfter.nonce);
    expect(latestDepositBefore.amount).to.equal(latestDepositAfter.amount);
  });

  it("should update latestDeposit if accepting an eth deposit via contract method", async () => {
    const assetId = addressZero;
    const depositTx = await channel.populateTransaction.depositA(assetId, value, { value });
    const nonceBefore = (await channel.getLatestDeposit(assetId)).nonce;
    await expect(alice.sendTransaction(depositTx)).to.be.fulfilled;
    const latestDeposit = await channel.getLatestDeposit(assetId);
    expect(latestDeposit.amount).to.equal(value);
    expect(latestDeposit.nonce).to.equal(nonceBefore.add(value));
  });

});
