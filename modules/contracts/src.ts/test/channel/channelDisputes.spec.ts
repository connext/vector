/* eslint-disable @typescript-eslint/no-empty-function */
import { CoreChannelState } from "@connext/vector-types";
import {
  hashCoreChannelState,
  signChannelMessage,
  toBN,
} from "@connext/vector-utils";
import { Contract } from "ethers";

import {
  addressZero,
  bob,
  hashZero,
  alice,
  provider,
  two,
} from "../constants";
import { expect } from "../utils";

import { createChannel } from "./creation.spec";

describe("Channel Disputes", () => {
  let channel: Contract;
  let channelState: CoreChannelState;
  let hashedState: string;
  let signatures: string[];

  beforeEach(async () => {
    channel = (await createChannel()).connect(alice);
    channelState = {
      assetIds: [addressZero],
      balances: [{ amount: ["0", "1"], to: [alice.address, bob.address] }],
      channelAddress: channel.address,
      merkleRoot: hashZero,
      nonce: 1,
      participants: [alice.address, bob.address],
      processedDepositsA: [],
      processedDepositsB: [],
      timeout: "1",
    };
    hashedState = hashCoreChannelState(channelState);
    signatures = [
      await signChannelMessage(hashedState, alice.privateKey),
      await signChannelMessage(hashedState, bob.privateKey),
    ];
  });

  it("should validate & store a new channel dispute", async () => {
    const tx = await channel.disputeChannel(channelState, signatures);
    await tx.wait();
    const txReciept = await provider.getTransactionReceipt(tx.hash);
    const start = toBN(txReciept.blockNumber);
    const channelDispute = await channel.getLatestChannelDispute();
    expect(channelDispute.channelStateHash).to.equal(hashedState);
    expect(channelDispute.nonce).to.equal(channelState.nonce);
    expect(channelDispute.merkleRoot).to.equal(channelState.merkleRoot);
    expect(channelDispute.consensusExpiry).to.equal(start.add(toBN(channelState.timeout)));
    expect(channelDispute.defundExpiry).to.equal(start.add(toBN(channelState.timeout).mul(two)));
    expect(channelDispute.isDefunded).to.be.false;
  });

  it.skip("should accept an update to an existing channel dispute", async () => {});

});
