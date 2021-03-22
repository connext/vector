import { signChannelMessage, expect } from "@connext/vector-utils";
import { BigNumber } from "@ethersproject/bignumber";
import { AddressZero } from "@ethersproject/constants";
import { Contract } from "@ethersproject/contracts";
import { parseEther } from "@ethersproject/units";
import { deployments } from "hardhat";

import { alice, bob, provider } from "../constants";
import { getContract, createChannel } from "../utils";

import { WithdrawCommitment } from "./withdraw";

describe("withdrawCommitment", function () {
  this.timeout(120_000);
  let channel: Contract;
  let token: Contract;
  const amount = "50";

  beforeEach(async () => {
    await deployments.fixture(); // Start w fresh deployments
    token = await getContract("TestToken", alice);
    channel = await createChannel();
    await (
      await alice.sendTransaction({
        to: channel.address,
        value: BigNumber.from(amount).mul(2),
      })
    ).wait(2);
    await (await token.transfer(channel.address, parseEther(amount))).wait(2);
  });

  it("can successfully withdraw Eth", async () => {
    const commitment = new WithdrawCommitment(
      channel.address,
      alice.address,
      bob.address,
      alice.address,
      AddressZero,
      amount,
      "1",
    );
    await commitment.addSignatures(
      await signChannelMessage(commitment.hashToSign(), alice.privateKey),
      await signChannelMessage(commitment.hashToSign(), bob.privateKey),
    );
    expect((await provider.getBalance(channel.address)).eq(BigNumber.from(amount).mul(2)));
    await alice.sendTransaction(await commitment.getSignedTransaction());
    expect((await provider.getBalance(channel.address)).eq(BigNumber.from(amount)));
  });

  it("can successfully withdraw Tokens", async () => {
    const commitment = new WithdrawCommitment(
      channel.address,
      alice.address,
      bob.address,
      alice.address,
      token.address,
      amount,
      "1",
    );
    await commitment.addSignatures(
      await signChannelMessage(commitment.hashToSign(), alice.privateKey),
      await signChannelMessage(commitment.hashToSign(), bob.privateKey),
    );
    expect((await token.balanceOf(channel.address)).eq(BigNumber.from(amount).mul(2)));
    await alice.sendTransaction(commitment.getSignedTransaction());
    expect((await token.balanceOf(channel.address)).eq(BigNumber.from(amount)));
  });
});
