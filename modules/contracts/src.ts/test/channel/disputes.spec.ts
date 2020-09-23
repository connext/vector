import { CoreChannelState } from "@connext/vector-types";
import {
  ChannelSigner,
  hashCoreChannelState,
  toBN,
} from "@connext/vector-utils";
import { constants, Contract } from "ethers";

import { initiator, counterparty, provider } from "../constants";
import { expect } from "../utils";

import { createChannel } from "./creation.spec";

const { AddressZero, HashZero, Two } = constants;

describe("Channel Disputes", () => {
  let channel: Contract;
  let channelState: CoreChannelState;

  beforeEach(async () => {
    channel = await createChannel();
    channelState = {
      assetIds: [AddressZero],
      balances: [{ amount: ["0", "1"], to: [initiator.address, counterparty.address] }],
      channelAddress: channel.address,
      latestDepositNonce: 1,
      lockedBalance: ["1", "2"],
      merkleRoot: HashZero,
      nonce: 1,
      participants: [initiator.address, counterparty.address],
      timeout: "1",
    };
  });

  it("should validate & store a new channel dispute", async () => {
    const hashedState = hashCoreChannelState(channelState);
    const signatures: string[] = [
      await (new ChannelSigner(initiator.privateKey, provider)).signMessage(hashedState),
      await (new ChannelSigner(counterparty.privateKey, provider)).signMessage(hashedState),
    ];
    const tx = await channel.disputeChannel(channelState, signatures);
    await tx.wait();
    const txReciept = await provider.getTransactionReceipt(tx.hash);
    const start = toBN(txReciept.blockNumber);
    const onchainDispute = await channel.getLatestChannelDispute();
    expect(onchainDispute.channelStateHash).to.equal(hashedState);
    expect(onchainDispute.nonce).to.equal(channelState.nonce);
    expect(onchainDispute.merkleRoot).to.equal(channelState.merkleRoot);
    expect(onchainDispute.consensusExpiry).to.equal(start.add(toBN(channelState.timeout)));
    expect(onchainDispute.defundExpiry).to.equal(start.add(toBN(channelState.timeout).mul(Two)));
    expect(onchainDispute.isDefunded).to.be.false;
  });

  it("should validate & store a new transfer dispute", async () => {
    const hashedState = hashCoreChannelState(channelState);
    const signatures: string[] = [
      await (new ChannelSigner(initiator.privateKey, provider)).signMessage(hashedState),
      await (new ChannelSigner(counterparty.privateKey, provider)).signMessage(hashedState),
    ];
    const tx = await channel.disputeChannel(channelState, signatures);
    await tx.wait();
    const txReciept = await provider.getTransactionReceipt(tx.hash);
    const start = toBN(txReciept.blockNumber);
    const onchainDispute = await channel.getLatestChannelDispute();
    expect(onchainDispute.channelStateHash).to.equal(hashedState);
    expect(onchainDispute.nonce).to.equal(channelState.nonce);
    expect(onchainDispute.merkleRoot).to.equal(channelState.merkleRoot);
    expect(onchainDispute.consensusExpiry).to.equal(start.add(toBN(channelState.timeout)));
    expect(onchainDispute.defundExpiry).to.equal(start.add(toBN(channelState.timeout).mul(Two)));
    expect(onchainDispute.isDefunded).to.be.false;
  });

});
