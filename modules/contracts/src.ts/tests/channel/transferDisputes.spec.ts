/* eslint-disable @typescript-eslint/no-empty-function */
import { CoreTransferState } from "@connext/vector-types";
import { getRandomBytes32, hashCoreTransferState, toBN, expect } from "@connext/vector-utils";
import { AddressZero, HashZero } from "@ethersproject/constants";
import { Contract } from "ethers";

import { bob, alice, provider } from "../../constants";

import { createChannel } from "./creation.spec";

describe("Transfer Disputes", () => {
  let channel: Contract;
  let transferState: CoreTransferState;
  let hashedState: string;
  let merkleProof: string[];

  beforeEach(async () => {
    channel = (await createChannel()).connect(alice);
    transferState = {
      initialBalance: { amount: ["0", "1"], to: [alice.address, bob.address] },
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
