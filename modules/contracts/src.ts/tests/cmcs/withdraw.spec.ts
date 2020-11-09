/* eslint-disable @typescript-eslint/no-empty-function */
import { ChannelSigner, expect, getRandomAddress, getRandomBytes32 } from "@connext/vector-utils";
import { AddressZero } from "@ethersproject/constants";
import { BigNumber, Contract, Wallet } from "ethers";
import { parseEther } from "ethers/lib/utils";

import { getTestAddressBook, getTestChannel, alice } from "..";
import { deployContracts, WithdrawCommitment } from "../..";
import { AddressBook } from "../../addressBook";
import { bob, provider } from "../constants";

describe("CMCWithdraw.sol", () => {
  const recipient = Wallet.createRandom().address;

  let channel: Contract;
  let failingToken: Contract;
  let addressBook: AddressBook;

  beforeEach(async () => {
    addressBook = await getTestAddressBook();
    channel = await getTestChannel(addressBook);

    await deployContracts(alice, addressBook, [["FailingToken", []]]);
    failingToken = addressBook.getContract("FailingToken");
    await failingToken.mint(alice.address, parseEther("0.001"));

    // Send tokens and eth to channel
    const ethTx = await alice.sendTransaction({ to: channel.address, value: parseEther("0.001") });
    await ethTx.wait();

    const tokenTx = await failingToken.mint(channel.address, parseEther("0.001"));
    await tokenTx.wait();

    // Make transfers pass
    const dontRevert = await failingToken.setTransferShouldRevert(false);
    await dontRevert.wait();
    const dontFail = await failingToken.setTransferShouldFail(false);
    await dontFail.wait();
  });

  it("should work for Ether", async () => {
    const preWithdrawRecipient = await provider.getBalance(recipient);
    const preWithdrawChannel = await provider.getBalance(channel.address);
    const withdrawAmount = BigNumber.from(1000);
    const nonce = BigNumber.from(1);
    const commitment = new WithdrawCommitment(
      channel.address,
      alice.address,
      bob.address,
      recipient,
      AddressZero,
      withdrawAmount.toString(),
      nonce.toString(),
    );

    const aliceSig = await new ChannelSigner(alice.privateKey).signMessage(commitment.hashToSign());
    const bobSig = await new ChannelSigner(bob.privateKey).signMessage(commitment.hashToSign());

    const withdrawData = commitment.getWithdrawData();
    expect(await channel.getWithdrawalTransactionRecord(withdrawData)).to.be.false;

    await channel.withdraw(withdrawData, aliceSig, bobSig);

    expect(await provider.getBalance(recipient)).to.be.eq(preWithdrawRecipient.add(withdrawAmount));
    expect(await provider.getBalance(channel.address)).to.be.eq(preWithdrawChannel.sub(withdrawAmount));
    expect(await channel.getTotalTransferred(AddressZero)).to.be.eq(withdrawAmount);
    expect(await channel.getWithdrawalTransactionRecord(withdrawData)).to.be.true;
  });

  it("should work for standard-compliant tokens", async () => {
    const preWithdrawRecipient = await failingToken.balanceOf(recipient);
    const preWithdrawChannel = await failingToken.balanceOf(channel.address);
    const withdrawAmount = BigNumber.from(1000);
    const nonce = BigNumber.from(1);
    const commitment = new WithdrawCommitment(
      channel.address,
      alice.address,
      bob.address,
      recipient,
      failingToken.address,
      withdrawAmount.toString(),
      nonce.toString(),
    );

    const aliceSig = await new ChannelSigner(alice.privateKey).signMessage(commitment.hashToSign());
    const bobSig = await new ChannelSigner(bob.privateKey).signMessage(commitment.hashToSign());

    const withdrawData = commitment.getWithdrawData();
    expect(await channel.getWithdrawalTransactionRecord(withdrawData)).to.be.false;

    await channel.withdraw(withdrawData, aliceSig, bobSig);

    expect(await failingToken.balanceOf(recipient)).to.be.eq(preWithdrawRecipient.add(withdrawAmount));
    expect(await failingToken.balanceOf(channel.address)).to.be.eq(preWithdrawChannel.sub(withdrawAmount));
    expect(await channel.getTotalTransferred(failingToken.address)).to.be.eq(withdrawAmount);
    expect(await channel.getWithdrawalTransactionRecord(withdrawData)).to.be.true;
  });

  it("should work for missing-return-value-bug tokens", async () => {
    await deployContracts(alice, addressBook, [["NonconformingToken", []]]);
    const nonconformingToken = addressBook.getContract("NonconformingToken");
    await nonconformingToken.mint(alice.address, parseEther("0.001"));

    // Send tokens to channel
    const tokenTx = await nonconformingToken.mint(channel.address, parseEther("0.001"));
    await tokenTx.wait();

    const preWithdrawRecipient = await nonconformingToken.balanceOf(recipient);
    const preWithdrawChannel = await nonconformingToken.balanceOf(channel.address);
    const withdrawAmount = BigNumber.from(1000);
    const nonce = BigNumber.from(1);
    const commitment = new WithdrawCommitment(
      channel.address,
      alice.address,
      bob.address,
      recipient,
      nonconformingToken.address,
      withdrawAmount.toString(),
      nonce.toString(),
    );

    const aliceSig = await new ChannelSigner(alice.privateKey).signMessage(commitment.hashToSign());
    const bobSig = await new ChannelSigner(bob.privateKey).signMessage(commitment.hashToSign());

    const withdrawData = commitment.getWithdrawData();
    expect(await channel.getWithdrawalTransactionRecord(withdrawData)).to.be.false;

    await channel.withdraw(withdrawData, aliceSig, bobSig);

    expect(await nonconformingToken.balanceOf(recipient)).to.be.eq(preWithdrawRecipient.add(withdrawAmount));
    expect(await nonconformingToken.balanceOf(channel.address)).to.be.eq(preWithdrawChannel.sub(withdrawAmount));
    expect(await channel.getTotalTransferred(nonconformingToken.address)).to.be.eq(withdrawAmount);
    expect(await channel.getWithdrawalTransactionRecord(withdrawData)).to.be.true;
  });

  it("should fail for wrong channel address", async () => {
    const withdrawAmount = BigNumber.from(1000);
    const nonce = BigNumber.from(1);
    const commitment = new WithdrawCommitment(
      getRandomAddress(),
      alice.address,
      bob.address,
      recipient,
      AddressZero,
      withdrawAmount.toString(),
      nonce.toString(),
    );

    const aliceSig = await new ChannelSigner(alice.privateKey).signMessage(commitment.hashToSign());
    const bobSig = await new ChannelSigner(bob.privateKey).signMessage(commitment.hashToSign());

    const withdrawData = commitment.getWithdrawData();
    await expect(channel.withdraw(withdrawData, aliceSig, bobSig)).revertedWith(
      "CMCWithdraw: Channel address mismatch",
    );
  });

  it("should fail if alice signature is invalid", async () => {
    const withdrawAmount = BigNumber.from(1000);
    const nonce = BigNumber.from(1);
    const commitment = new WithdrawCommitment(
      channel.address,
      alice.address,
      bob.address,
      recipient,
      AddressZero,
      withdrawAmount.toString(),
      nonce.toString(),
    );

    const aliceSig = await new ChannelSigner(alice.privateKey).signMessage(getRandomBytes32());
    const bobSig = await new ChannelSigner(bob.privateKey).signMessage(commitment.hashToSign());

    const withdrawData = commitment.getWithdrawData();
    await expect(channel.withdraw(withdrawData, aliceSig, bobSig)).revertedWith(
      "CMCWithdraw: Invalid alice signature",
    );
  });

  it("should fail if bob signature is invalid", async () => {
    const withdrawAmount = BigNumber.from(1000);
    const nonce = BigNumber.from(1);
    const commitment = new WithdrawCommitment(
      channel.address,
      alice.address,
      bob.address,
      recipient,
      AddressZero,
      withdrawAmount.toString(),
      nonce.toString(),
    );

    const aliceSig = await new ChannelSigner(alice.privateKey).signMessage(commitment.hashToSign());
    const bobSig = await new ChannelSigner(bob.privateKey).signMessage(getRandomBytes32());

    const withdrawData = commitment.getWithdrawData();
    await expect(channel.withdraw(withdrawData, aliceSig, bobSig)).revertedWith(
      "CMCWithdraw: Invalid bob signature",
    );
  });

  it("should fail if the tx has already been executed", async () => {
    const withdrawAmount = BigNumber.from(1000);
    const nonce = BigNumber.from(1);
    const commitment = new WithdrawCommitment(
      channel.address,
      alice.address,
      bob.address,
      recipient,
      AddressZero,
      withdrawAmount.toString(),
      nonce.toString(),
    );

    const aliceSig = await new ChannelSigner(alice.privateKey).signMessage(commitment.hashToSign());
    const bobSig = await new ChannelSigner(bob.privateKey).signMessage(commitment.hashToSign());

    const withdrawData = commitment.getWithdrawData();
    await channel.withdraw(withdrawData, aliceSig, bobSig);
    await expect(channel.withdraw(withdrawData, aliceSig, bobSig)).revertedWith(
      "CMCWithdraw: Transaction has already been executed",
    );
  });

  it.skip("should fail for call with empty call data", async () => {
  });

  it.skip("should fail for call to address without code", async () => {
  });

  it.skip("should fail if call reverts", async () => {
  });
});
