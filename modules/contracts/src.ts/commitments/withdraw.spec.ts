import { signChannelMessage, expect } from "@connext/vector-utils";
import { BigNumber, constants, Contract, ContractFactory } from "ethers";

import { TestToken } from "../artifacts";
import { bob, alice, createTestChannel, provider } from "../tests";

import { WithdrawCommitment } from "./withdraw";

describe("withdrawCommitment", () => {
  let channel: Contract;
  let token: Contract;
  const amount = "50";

  beforeEach(async () => {
    channel = await createTestChannel();
    const tx = await alice.sendTransaction({
      to: channel.address,
      value: BigNumber.from(amount).mul(2),
    });
    await tx.wait();
    token = await new ContractFactory(TestToken.abi, TestToken.bytecode, alice).deploy("Test", "TST");
    await token.mint(channel.address, BigNumber.from(amount).mul(2));
  });

  it("can successfully withdraw Eth", async () => {
    const commitment = new WithdrawCommitment(
      channel.address,
      alice.address,
      bob.address,
      alice.address,
      constants.AddressZero,
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
    await alice.sendTransaction(await commitment.getSignedTransaction());
    expect((await token.balanceOf(channel.address)).eq(BigNumber.from(amount)));
  });
});
