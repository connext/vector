/* eslint-disable @typescript-eslint/no-empty-function */
import { CoreChannelState, CoreTransferState } from "@connext/vector-types";
import {
  getRandomBytes32,
  hashCoreTransferState,
  toBN,
  expect,
  hashCoreChannelState,
  signChannelMessage,
} from "@connext/vector-utils";
import { AddressZero, HashZero, Two } from "@ethersproject/constants";
import { Contract } from "ethers";

import { bob, alice, provider } from "../constants";
import { createTestChannel } from "../utils";

describe("CMCAdjudicator.sol", () => {
  let channel: Contract;

  beforeEach(async () => {
    channel = (await createTestChannel()).connect(alice);
  });

  describe("Channel Disputes", () => {
    let channelState: CoreChannelState;
    let hashedState: string;
    let signatures: string[];

    beforeEach(async () => {
      channelState = {
        assetIds: [AddressZero],
        balances: [{ amount: ["0", "1"], to: [alice.address, bob.address] }],
        channelAddress: channel.address,
        merkleRoot: HashZero,
        nonce: 1,
        alice: alice.address,
        bob: bob.address,
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
      expect(channelDispute.defundExpiry).to.equal(start.add(toBN(channelState.timeout).mul(Two)));
      expect(channelDispute.isDefunded).to.be.false;
    });

    it.skip("should accept an update to an existing channel dispute", async () => {});
  });

  describe("Transfer Disputes", () => {
    let transferState: CoreTransferState;
    let hashedState: string;
    let merkleProof: string[];

    beforeEach(async () => {
      transferState = {
        balance: { amount: ["0", "1"], to: [alice.address, bob.address] },
        assetId: AddressZero,
        channelAddress: channel.address,
        transferId: getRandomBytes32(),
        transferDefinition: AddressZero,
        transferTimeout: "1",
        initialStateHash: HashZero,
        initiator: alice.address,
        responder: bob.address,
      };
      merkleProof = [HashZero];
      hashedState = hashCoreTransferState(transferState);
    });

    it.skip("should validate & store a new transfer dispute", async () => {
      const tx = await channel.disputeTransfer(transferState, merkleProof);
      await tx.wait();
      const txReciept = await provider.getTransactionReceipt(tx.hash);
      const start = toBN(txReciept.blockNumber);
      const transferDispute = await channel.getLatestTransferDispute();
      expect(transferDispute.transferDisputeExpiry).to.equal(start.add(toBN(transferState.transferTimeout)));
      expect(transferDispute.transferStateHash).to.equal(hashedState);
      expect(transferDispute.isDefunded).to.be.false;
    });

    it.skip("should accept an update to an existing transfer dispute", async () => {});
  });
});
