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
  counterparty,
  hashZero,
  initiator,
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
    channel = (await createChannel()).connect(initiator);
    channelState = {
      assetIds: [addressZero],
      balances: [{ amount: ["0", "1"], to: [initiator.address, counterparty.address] }],
      channelAddress: channel.address,
      latestDepositNonce: 1,
      lockedBalance: ["1", "2"],
      merkleRoot: hashZero,
      nonce: 1,
      participants: [initiator.address, counterparty.address],
      timeout: "1",
    };
    hashedState = hashCoreChannelState(channelState);
    signatures = [
      await signChannelMessage(hashedState, initiator.privateKey),
      await signChannelMessage(hashedState, counterparty.privateKey),
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
