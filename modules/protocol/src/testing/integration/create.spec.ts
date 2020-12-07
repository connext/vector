/* eslint-disable @typescript-eslint/no-empty-function */
import { getTestLoggers, expect, mkAddress } from "@connext/vector-utils";
import { IVectorProtocol, IChannelSigner, IVectorStore, ProtocolEventName } from "@connext/vector-types";
import { AddressZero } from "@ethersproject/constants";
import { BigNumber } from "@ethersproject/bignumber";

import { env } from "../env";
import { createTransfer, getFundedChannel, depositInChannel } from "../utils";

const testName = "Create Integrations";
const { log } = getTestLoggers(testName, env.logLevel);

describe(testName, () => {
  let alice: IVectorProtocol;
  let bob: IVectorProtocol;

  let abChannelAddress: string;
  let aliceSigner: IChannelSigner;
  let bobSigner: IChannelSigner;
  let aliceStore: IVectorStore;
  let bobStore: IVectorStore;

  let transferAmount: string;
  let assetId: string;
  let depositAmount: BigNumber;

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
    bobSigner = setup.bob.signer;
    aliceStore = setup.alice.store;
    bobStore = setup.bob.store;

    // Set constants
    transferAmount = "7";
    assetId = AddressZero;
    depositAmount = BigNumber.from("1000");

    log.info({
      alice: alice.publicIdentifier,
      bob: bob.publicIdentifier,
    });
  });

  afterEach(async () => {
    await alice.off();
    await bob.off();
  });

  const runTest = async (channel: any, transfer: any): Promise<void> => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { transferResolver, ...sanitized } = transfer;

    expect(await alice.getChannelState(channel.channelAddress)).to.containSubset(channel);
    expect(await alice.getTransferState(transfer.transferId)).to.containSubset(sanitized);
    expect(await alice.getActiveTransfers(channel.channelAddress)).to.containSubset([sanitized]);
    expect(await bob.getChannelState(channel.channelAddress)).to.containSubset(channel);
    expect(await bob.getTransferState(transfer.transferId)).to.containSubset(sanitized);
    expect(await bob.getActiveTransfers(channel.channelAddress)).to.containSubset([sanitized]);
  };

  it("should create an eth transfer from alice -> bob", async () => {
    // Set test constants
    const alicePromise = alice.waitFor(ProtocolEventName.CHANNEL_UPDATE_EVENT, 10_000);
    const bobPromise = bob.waitFor(ProtocolEventName.CHANNEL_UPDATE_EVENT, 10_000);
    const { channel, transfer } = await createTransfer(abChannelAddress, alice, bob, assetId, transferAmount);

    const [_, aliceEvent, bobEvent] = await Promise.all([runTest(channel, transfer), alicePromise, bobPromise]);

    expect(aliceEvent.updatedTransfers?.length).to.eq(1);
    expect(aliceEvent).to.deep.eq(bobEvent);
  });

  it("should create an eth transfer from bob -> alice", async () => {
    const { channel, transfer } = await createTransfer(abChannelAddress, bob, alice, assetId, transferAmount);

    await runTest(channel, transfer);
  });

  it("should work for alice creating transfer out of channel", async () => {
    const outsiderPayee = mkAddress("0xc");
    const { channel, transfer } = await createTransfer(
      abChannelAddress,
      alice,
      bob,
      assetId,
      transferAmount,
      outsiderPayee,
    );
    await runTest(channel, transfer);
  });

  it("should work for bob creating transfer out of channel", async () => {
    const outsiderPayee = mkAddress("0xc");
    const { channel, transfer } = await createTransfer(
      abChannelAddress,
      bob,
      alice,
      assetId,
      transferAmount,
      outsiderPayee,
    );
    await runTest(channel, transfer);
  });
  it("should work for concurrent transfers from alice to bob", async () => {
    // Create two transfers from alice to bob
    const concurrentResult = await Promise.all([
      createTransfer(abChannelAddress, alice, bob, assetId, transferAmount),
      createTransfer(abChannelAddress, alice, bob, assetId, transferAmount),
    ]);
    log.info(concurrentResult);
  });

  it("should work for concurrent transfers from alice -> [bob, carol]", async () => {
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

  it.only("should work if initiator channel is out of sync", async () => {
    const initial = await aliceStore.getChannelState(abChannelAddress);
    await depositInChannel(abChannelAddress, alice, aliceSigner, bob, assetId, depositAmount);

    await aliceStore.saveChannelState(initial!);
    const { channel, transfer } = await createTransfer(abChannelAddress, alice, bob, assetId, transferAmount);

    await runTest(channel, transfer);
  });
  it("should work if responder channel is out of sync", async () => {
    const initial = await aliceStore.getChannelState(abChannelAddress);
    await depositInChannel(abChannelAddress, bob, bobSigner, alice, assetId, depositAmount);

    await bobStore.saveChannelState(initial!);
    const { channel, transfer } = await createTransfer(abChannelAddress, alice, bob, assetId, transferAmount);

    await runTest(channel, transfer);
    expect(channel.nonce).to.be.eq(initial!.nonce + 2);
  });
});
