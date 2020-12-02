/* eslint-disable @typescript-eslint/no-empty-function */
import { getTestLoggers, expect, mkAddress } from "@connext/vector-utils";
import { IVectorProtocol, IChannelSigner, IVectorStore, ProtocolEventName } from "@connext/vector-types";
import { AddressZero } from "@ethersproject/constants";

import { env } from "../env";
import { createTransfer, getFundedChannel } from "../utils";

const testName = "Create Integrations";
const { log } = getTestLoggers(testName, env.logLevel);

describe(testName, () => {
  let alice: IVectorProtocol;
  let bob: IVectorProtocol;

  let abChannelAddress: string;
  let aliceSigner: IChannelSigner;
  let aliceStore: IVectorStore;

  beforeEach(async () => {
    const setup = await getFundedChannel(testName, [
      {
        assetId: AddressZero,
        amount: ["100", "100"],
      },
    ]);
    alice = setup.alice.protocol;
    bob = setup.bob.protocol;
    abChannelAddress = setup.channel.channelAddress;
    aliceSigner = setup.alice.signer;
    aliceStore = setup.alice.store;

    log.info({
      alice: alice.publicIdentifier,
      bob: bob.publicIdentifier,
    });
  });

  afterEach(async () => {
    await alice.off();
    await bob.off();
  });

  it("should create an eth transfer from alice -> bob", async () => {
    // Set test constants
    const assetId = AddressZero;
    const transferAmount = "7";
    const alicePromise = alice.waitFor(ProtocolEventName.CHANNEL_UPDATE_EVENT, 10_000);
    const bobPromise = bob.waitFor(ProtocolEventName.CHANNEL_UPDATE_EVENT, 10_000);
    const { channel, transfer } = await createTransfer(abChannelAddress, alice, bob, assetId, transferAmount);
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { transferResolver, ...toCompare } = transfer;
    expect(await alice.getChannelState(channel.channelAddress)).to.containSubset(channel);
    expect(await alice.getTransferState(transfer.transferId)).to.containSubset(toCompare);
    expect(await alice.getActiveTransfers(channel.channelAddress)).to.containSubset([toCompare]);
    expect(await bob.getChannelState(channel.channelAddress)).to.containSubset(channel);
    expect(await bob.getTransferState(transfer.transferId)).to.containSubset(toCompare);
    expect(await bob.getActiveTransfers(channel.channelAddress)).to.containSubset([toCompare]);
    const aliceEvent = await alicePromise;
    expect(aliceEvent.updatedTransfers?.length).to.eq(1);
    const bobEvent = await bobPromise;
    expect(aliceEvent).to.deep.eq(bobEvent);
  });

  it("should create an eth transfer from bob -> alice", async () => {
    // Set test constants
    const assetId = AddressZero;
    const transferAmount = "7";
    const { channel, transfer } = await createTransfer(abChannelAddress, bob, alice, assetId, transferAmount);
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { transferResolver, ...sanitized } = transfer;
    expect(await bob.getChannelState(channel.channelAddress)).to.containSubset(channel);
    expect(await bob.getTransferState(transfer.transferId)).to.containSubset(sanitized);
    expect(await alice.getChannelState(channel.channelAddress)).to.containSubset(channel);
    expect(await alice.getTransferState(transfer.transferId)).to.containSubset(sanitized);
  });

  it("should work for alice creating transfer out of channel", async () => {
    // Set test constants
    const assetId = AddressZero;
    const transferAmount = "7";
    const outsiderPayee = mkAddress("0xc");
    const { channel, transfer } = await createTransfer(
      abChannelAddress,
      alice,
      bob,
      assetId,
      transferAmount,
      outsiderPayee,
    );
    const { transferResolver, ...sanitized } = transfer;
    expect(await alice.getChannelState(channel.channelAddress)).to.containSubset(channel);
    expect(await alice.getTransferState(transfer.transferId)).to.containSubset(sanitized);
    expect(await alice.getActiveTransfers(channel.channelAddress)).to.containSubset([sanitized]);
    expect(await bob.getChannelState(channel.channelAddress)).to.containSubset(channel);
    expect(await bob.getTransferState(transfer.transferId)).to.containSubset(sanitized);
    expect(await bob.getActiveTransfers(channel.channelAddress)).to.containSubset([sanitized]);
  });
  
  it("should work for bob creating transfer out of channel", async () => {
    // Set test constants
    const assetId = AddressZero;
    const transferAmount = "7";
    const outsiderPayee = mkAddress("0xc");
    const { channel, transfer } = await createTransfer(
      abChannelAddress,
      bob,
      alice,
      assetId,
      transferAmount,
      outsiderPayee,
    );
    const { transferResolver, ...sanitized } = transfer;
    expect(await alice.getChannelState(channel.channelAddress)).to.containSubset(channel);
    expect(await alice.getTransferState(transfer.transferId)).to.containSubset(sanitized);
    expect(await alice.getActiveTransfers(channel.channelAddress)).to.containSubset([sanitized]);
    expect(await bob.getChannelState(channel.channelAddress)).to.containSubset(channel);
    expect(await bob.getTransferState(transfer.transferId)).to.containSubset(sanitized);
    expect(await bob.getActiveTransfers(channel.channelAddress)).to.containSubset([sanitized]);
  });

  it("should work for concurrent transfers from alice to bob", async () => {
    // Set transfer constants
    const transferAmount = "7";
    const assetId = AddressZero;
    // Create two transfers from alice to bob
    const concurrentResult = await Promise.all([
      createTransfer(abChannelAddress, alice, bob, assetId, transferAmount),
      createTransfer(abChannelAddress, alice, bob, assetId, transferAmount),
    ]);
    log.info(concurrentResult);
  });

  it("should work for concurrent transfers from alice -> [bob, carol]", async () => {
    // Set transfer constants
    const transferAmount = "7";
    const assetId = AddressZero;

    // Create an alice <-> carol channel
    const setup = await getFundedChannel(
      testName,
      [
        {
          assetId,
          amount: ["100", "100"],
        },
      ],
      { signer: aliceSigner, store: aliceStore },
    );
    const carol = setup.bob.protocol;
    const acChannelAddress = setup.channel.channelAddress;
    // Create two transfers from alice to bob/carol
    await Promise.all([
      createTransfer(abChannelAddress, alice, bob, assetId, transferAmount),
      createTransfer(abChannelAddress, alice, bob, assetId, transferAmount),
      createTransfer(acChannelAddress, alice, carol, assetId, transferAmount),
      createTransfer(acChannelAddress, alice, carol, assetId, transferAmount),
    ]);
  });

  it.skip("should work if initiator channel is out of sync", async () => {
    // Set test constants
    const assetId = AddressZero;
    const transferAmount = "7";
    const { channel, transfer } = await createTransfer(abChannelAddress, bob, alice, assetId, transferAmount);
  });
  it.skip("should work if responder channel is out of sync", async () => {});
});
