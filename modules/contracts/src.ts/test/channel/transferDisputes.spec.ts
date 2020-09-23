/* eslint-disable @typescript-eslint/no-empty-function */
import { CoreTransferState } from "@connext/vector-types";
import {
  getRandomBytes32,
  hashCoreTransferState,
  toBN,
} from "@connext/vector-utils";
import { Contract } from "ethers";

import {
  addressZero,
  counterparty,
  hashZero,
  initiator,
  provider,
} from "../constants";
import { expect } from "../utils";

import { createChannel } from "./creation.spec";

describe("Transfer Disputes", () => {
  let channel: Contract;
  let transferState: CoreTransferState;
  let hashedState: string;
  let merkleProof: string[];

  beforeEach(async () => {
    channel = (await createChannel()).connect(initiator);
    transferState = {
      initialBalance: { amount: ["0", "1"], to: [initiator.address, counterparty.address] },
      assetId: addressZero,
      channelAddress: channel.address,
      transferId: getRandomBytes32(),
      transferDefinition: addressZero,
      transferTimeout: "1",
      initialStateHash: hashZero,
    };
    merkleProof = [hashZero];
    hashedState = hashCoreTransferState(transferState);
  });

  it.skip("should validate & store a new transfer dispute", async () => {
    console.log(`Starting dispute`);
    const tx = await channel.disputeTransfer(transferState, merkleProof);
    console.log(`Dispute started`);
    await tx.wait();
    const txReciept = await provider.getTransactionReceipt(tx.hash);
    const start = toBN(txReciept.blockNumber);
    const transferDispute = await channel.getLatestTransferDispute();
    expect(transferDispute.transferDisputeExpiry).to.equal(
      start.add(toBN(transferState.transferTimeout)),
    );
    expect(transferDispute.transferStateHash).to.equal(hashedState);
    expect(transferDispute.isDefunded).to.be.false;
  });

  it.skip("should accept an update to an existing transfer dispute", async () => {});

});
