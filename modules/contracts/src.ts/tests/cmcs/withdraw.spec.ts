/* eslint-disable @typescript-eslint/no-empty-function */
import { ChannelSigner, expect, getRandomBytes32 } from "@connext/vector-utils";
import { AddressZero } from "@ethersproject/constants";
import { BigNumber, Contract, Wallet } from "ethers";
import { parseEther } from "ethers/lib/utils";

import { getTestAddressBook, getTestChannel, alice } from "..";
import { deployContracts, WithdrawCommitment } from "../..";
import { bob, provider } from "../constants";

describe("CMCWithdraw.sol", () => {
  const recipient = Wallet.createRandom().address;

  let channel: Contract;
  let failingToken: Contract;

  beforeEach(async () => {
    const addressBook = await getTestAddressBook();
    channel = await getTestChannel(addressBook);

    await deployContracts(alice, addressBook, [["FailingToken", []]]);
    failingToken = addressBook.getContract("FailingToken");
    await failingToken.mint(alice.address, parseEther("0.001"));

    // Send tokens and eth to channel
    const ethTx = await alice.sendTransaction({ to: channel.address, value: parseEther("0.001") });
    await ethTx.wait();

    const tokenTx = await failingToken.mint(channel.address, parseEther("0.001"));
    await tokenTx.wait();
  });

  it("should work", async () => {
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
    expect(await channel.getWithdrawalTransactionRecord(recipient, AddressZero, withdrawAmount, nonce)).to.be.false;

    await channel.withdraw(recipient, AddressZero, withdrawAmount, nonce, aliceSig, bobSig);

    expect(await provider.getBalance(recipient)).to.be.eq(preWithdrawRecipient.add(withdrawAmount));
    expect(await provider.getBalance(channel.address)).to.be.eq(preWithdrawChannel.sub(withdrawAmount));
    expect(await channel.getTotalTransferred(AddressZero)).to.be.eq(withdrawAmount);
    expect(await channel.getWithdrawalTransactionRecord(recipient, AddressZero, withdrawAmount, nonce)).to.be.true;
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

    await channel.withdraw(recipient, AddressZero, withdrawAmount, nonce, aliceSig, bobSig);
    await expect(channel.withdraw(recipient, AddressZero, withdrawAmount, nonce, aliceSig, bobSig)).revertedWith(
      "CMCWithdraw: Transaction has already been executed",
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

    await expect(channel.withdraw(recipient, AddressZero, withdrawAmount, nonce, aliceSig, bobSig)).revertedWith(
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

    await expect(channel.withdraw(recipient, AddressZero, withdrawAmount, nonce, aliceSig, bobSig)).revertedWith(
      "CMCWithdraw: Invalid bob signature",
    );
  });

  it("should fail if transfer fails", async () => {
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

    await expect(
      channel.withdraw(recipient, failingToken.address, withdrawAmount, nonce, aliceSig, bobSig),
    ).revertedWith("CMCWithdraw: Transfer failed");
  });
});
