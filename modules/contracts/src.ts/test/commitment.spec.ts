import { signChannelMessage } from "@connext/vector-utils";
import { BigNumber, constants, Contract, ContractFactory } from "ethers";

import { TestToken } from "../artifacts";
import { WithdrawCommitment } from "../commitment";

import { createChannel } from "./channel/creation.spec";
import { counterparty, initiator, provider } from "./constants";
import { expect } from "./utils";

describe("withdrawCommitment", () => {
  let channel: Contract;
  let token: Contract;
  const amount = "50";

  beforeEach(async () => {
    channel = await createChannel();
    const tx = await initiator.sendTransaction({
      to: channel.address,
      value: BigNumber.from(amount).mul(2),
    });
    await tx.wait();
    token = await (
      new ContractFactory(TestToken.abi, TestToken.bytecode, initiator)
    ).deploy("Test", "TST");
    await token.mint(channel.address, BigNumber.from(amount).mul(2));
  });

  it("can successfully withdraw Eth", async () => {
    const commitment = new WithdrawCommitment(
      channel.address,
      [initiator.address, counterparty.address],
      initiator.address,
      constants.AddressZero,
      amount,
      "1",
    );
    const hash = commitment.hashToSign();
    const signatureA = await signChannelMessage(hash, initiator.privateKey);
    const signatureB = await signChannelMessage(hash, counterparty.privateKey);
    await commitment.addSignatures(signatureA, signatureB);
    const tx = await commitment.getSignedTransaction();
    expect((await provider.getBalance(channel.address)).eq(BigNumber.from(amount).mul(2)));
    await initiator.sendTransaction(tx);
    // Check after balance
    expect((await provider.getBalance(channel.address)).eq(BigNumber.from(amount)));
  });

  it("can successfully withdraw Tokens", async () => {
    const commitment = new WithdrawCommitment(
      channel.address,
      [initiator.address, counterparty.address],
      initiator.address,
      token.address,
      amount,
      "1",
    );
    const hash = commitment.hashToSign();
    const signatureA = await signChannelMessage(hash, initiator.privateKey);
    const signatureB = await signChannelMessage(hash, counterparty.privateKey);
    await commitment.addSignatures(signatureA, signatureB);
    const tx = await commitment.getSignedTransaction();
    expect((await token.balanceOf(channel.address)).eq(BigNumber.from(amount).mul(2)));
    await initiator.sendTransaction(tx);
    expect((await token.balanceOf(channel.address)).eq(BigNumber.from(amount)));
  });

});
