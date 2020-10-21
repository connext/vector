import { signChannelMessage, expect } from "@connext/vector-utils";
import { BigNumber, constants, Contract, utils } from "ethers";

import { deployContracts } from "../actions";
import { AddressBook } from "../addressBook";
import { bob, alice, getTestChannel, getTestAddressBook, provider } from "../tests";

import { WithdrawCommitment } from "./withdraw";

const { parseEther } = utils;

describe("withdrawCommitment", () => {
  let addressBook: AddressBook;
  let channel: Contract;
  let token: Contract;
  const amount = "50";

  beforeEach(async () => {
    addressBook = await getTestAddressBook();
    await deployContracts(alice, addressBook, [["TestToken", []]]);
    token = addressBook.getContract("TestToken");
    channel = await getTestChannel(addressBook);
    await (await alice.sendTransaction({
      to: channel.address,
      value: BigNumber.from(amount).mul(2),
    })).wait();
    await (await token.transfer(channel.address, parseEther(amount))).wait();
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
