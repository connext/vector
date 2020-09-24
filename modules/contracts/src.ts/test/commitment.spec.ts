import { getRandomChannelSigner } from "@connext/vector-utils";
import { BigNumber, constants, Contract, ContractFactory } from "ethers";

import { TestToken } from "../artifacts";
import { WithdrawCommitment } from "../commitment";

import { createChannel } from "./channel/creation.spec";
import { initiator, provider } from "./constants";
import { expect } from "./utils";

describe.only("withdrawCommitment", () => {
  let channel: Contract;
  let token: Contract;

  const participantA = getRandomChannelSigner(provider);
  const participantB = getRandomChannelSigner(provider);
  const amount = "50";

  beforeEach(async () => {
    channel = await createChannel();
    token = await new ContractFactory(TestToken.abi, TestToken.bytecode, initiator).deploy("Test", "TST");
    await token.mint(channel.address, BigNumber.from(amount).mul(2));
  });

  it("can create the commitment", () => {
    const commitment = new WithdrawCommitment(
      channel.address,
      [participantA.address, participantB.address],
      participantA.address,
      constants.AddressZero,
      amount,
      "1",
    );
    expect(commitment).to.be.ok;
  });

  it.only("can successfully withdraw Eth", async () => {
    const commitment = new WithdrawCommitment(
      channel.address,
      [participantA.address, participantB.address],
      participantA.address,
      constants.AddressZero,
      amount,
      "1",
    );
    const hash = commitment.hashToSign();
    const encoded = commitment.encode();
    const signatureA = await participantA.signMessage(hash);
    const signatureB = await participantB.signMessage(hash);
    await commitment.addSignatures(signatureA, signatureB);
    const tx = await commitment.getSignedTransaction();
    // Check before balance

    const onchainEncoded = await channel.encodeTransaction(
      tx.to,
      tx.value,
      tx.data,
      commitment.nonce,
      [signatureA, signatureB],
    );
    console.log(`onchain=${onchainEncoded} | offchain=${encoded}`);
    expect(onchainEncoded).to.equal(encoded);

    const onchainHash = await channel.hashTransaction(
      tx.to,
      tx.value,
      tx.data,
      commitment.nonce,
      [signatureA, signatureB],
    );

    console.log(`onchain=${onchainHash} | offchain=${hash}`);
    expect(onchainHash).to.equal(hash);

    expect((await provider.getBalance(channel.address)).eq(BigNumber.from(amount).mul(2)));
    await initiator.sendTransaction(tx);
    // Check after balance
    expect((await provider.getBalance(channel.address)).eq(BigNumber.from(amount)));
  });

  it("can successfully withdraw Tokens", async () => {
    const commitment = new WithdrawCommitment(
      channel.address,
      [participantA.address, participantB.address],
      participantA.address,
      token.address,
      amount,
      "1",
    );
    const signatureA = await participantA.signMessage(commitment.hashToSign());
    const signatureB = await participantB.signMessage(commitment.hashToSign());
    await commitment.addSignatures(signatureA, signatureB);
    const tx = await commitment.getSignedTransaction();
    // Check before balance
    expect((await channel.getBalance(token.address)).eq(BigNumber.from(amount).mul(2)));
    await initiator.sendTransaction(tx);
    // Check after balance
    expect((await channel.getBalance(token.address)).eq(BigNumber.from(amount)));
  });

});
