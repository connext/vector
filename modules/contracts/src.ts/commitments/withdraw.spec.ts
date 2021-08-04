import { signChannelMessage, expect } from "@connext/vector-utils";
import { BigNumber } from "@ethersproject/bignumber";
import { AddressZero } from "@ethersproject/constants";
import { parseEther } from "@ethersproject/units";
import { deployments } from "hardhat";
import { ChannelMastercopy, ERC20 } from "../../typechain";

import { alice, bob, provider } from "../constants";
import { getContract, createChannel } from "../utils";

import { WithdrawCommitment } from "./withdraw";

describe.only("withdrawCommitment", function () {
  this.timeout(120_000);
  let channel: ChannelMastercopy;
  let token: ERC20;
  const amount = "50";

  beforeEach(async () => {
    await deployments.fixture(); // Start w fresh deployments
    token = await getContract("TestToken", alice);
    console.log("got token");
    channel = await createChannel();
    console.log("created channel");
    await (
      await alice.sendTransaction({
        to: channel.address,
        value: BigNumber.from(amount).mul(2),
      })
    ).wait();
    console.log("sent eth");
    await (await token.transfer(channel.address, parseEther(amount))).wait();
    console.log("sent token");
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
