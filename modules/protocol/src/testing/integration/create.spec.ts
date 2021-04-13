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
    const { transferResolver, meta, ...sanitized } = transfer;

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
    expect(aliceEvent.updatedChannelState).to.deep.eq(bobEvent.updatedChannelState);
    const { meta, ...sanitized } = aliceEvent.updatedTransfer!;
    expect(bobEvent.updatedTransfer).to.containSubset(sanitized);
    expect(bobEvent.updatedTransfers).to.containSubset([sanitized]);
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
    const preTransfer = await aliceStore.getChannelState(abChannelAddress);
    const assetIdx = preTransfer!.assetIds.findIndex((a) => a === assetId);
    const [initAlice, initBob] = preTransfer!.balances[assetIdx].amount;
    const concurrentResult = await Promise.all([
      createTransfer(abChannelAddress, alice, bob, assetId, transferAmount, undefined, undefined, true),
      createTransfer(abChannelAddress, alice, bob, assetId, transferAmount, undefined, undefined, true),
    ]);
    const postTransfer = await aliceStore.getChannelState(abChannelAddress);
    const [finalAlice, finalBob] = postTransfer!.balances[assetIdx].amount;
    const transferred = BigNumber.from(transferAmount).mul(2);
    expect(finalAlice).to.be.eq(BigNumber.from(initAlice).sub(transferred));
    expect(finalBob).to.be.eq(BigNumber.from(initBob));

    log.info(concurrentResult);
  });

  it("should interleave updates for many concurrent transfers in each direction", async () => {
    // Create two transfers from alice to bob
    const preTransfer = (await aliceStore.getChannelState(abChannelAddress))!;
    const preNonce = preTransfer.latestUpdate.nonce;
    const assetIdx = preTransfer.assetIds.findIndex((a) => a === assetId);
    const [initAlice, initBob] = preTransfer.balances[assetIdx].amount;
    const promises = [];
    // First adds 20 alice -> bob
    // Then adds 20 bob -> alice
    for (let i = 0; i < 40; i++) {
      let [initiator, receiver] = i < 20 ? [alice, bob] : [bob, alice];
      createTransfer(abChannelAddress, initiator, receiver, assetId, transferAmount, undefined, undefined, true);
    }
    const concurrentResult = await Promise.all(promises);
    const postTransfer = (await aliceStore.getChannelState(abChannelAddress))!;
    const postNonce = postTransfer.latestUpdate.nonce;
    const [finalAlice, finalBob] = postTransfer!.balances[assetIdx].amount;
    const transferredAlice = BigNumber.from(transferAmount).mul(20);
    expect(finalAlice).to.be.eq(BigNumber.from(initAlice).sub(transferredAlice));
    const transferredBob = BigNumber.from(transferAmount).mul(20);
    expect(finalBob).to.be.eq(BigNumber.from(initBob).sub(transferredBob));

    // If updates are not interleaved we would expect the nonce to increase by 2 on most transfers.
    // There are 40 transfers, so the upper bound would be roughly preNonce + 80.
    // If the updates are perfectly interleaved we would expect the nonce to increase by 1 on most transfers.
    // There are 40 transfers, so the lower bound would be roughly preNonce + 40.
    // In reality this depends on who's turn it was when the interaction started and may be off for
    // race conditions.
    // So this will just verify the result is within 50% of ideal.
    expect(postNonce).to.be.greaterThan(preNonce + 39);
    expect(postNonce).to.be.lessThan(preNonce + 61);

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
    // Get balances
    const preTransferAC = await aliceStore.getChannelState(acChannelAddress);
    const assetIdx = preTransferAC!.assetIds.findIndex((a) => a === assetId);
    const [initAliceC, initCarol] = preTransferAC!.balances[assetIdx].amount;

    const preTransferAB = await aliceStore.getChannelState(abChannelAddress);
    const assetIdxAB = preTransferAB!.assetIds.findIndex((a) => a === assetId);
    const [initAliceB, initBob] = preTransferAB!.balances[assetIdxAB].amount;

    // Create two transfers from alice to bob/carol
    await Promise.all([
      createTransfer(abChannelAddress, alice, bob, assetId, transferAmount, undefined, undefined, true),
      createTransfer(abChannelAddress, alice, bob, assetId, transferAmount, undefined, undefined, true),
      createTransfer(acChannelAddress, alice, carol, assetId, transferAmount, undefined, undefined, true),
      createTransfer(acChannelAddress, alice, carol, assetId, transferAmount, undefined, undefined, true),
    ]);

    // Verify transfers
    const postTransferAB = await aliceStore.getChannelState(abChannelAddress);
    const [finalAliceB, finalBob] = postTransferAB!.balances[assetIdxAB].amount;

    const postTransferAC = await aliceStore.getChannelState(acChannelAddress);
    const [finalAliceC, finalCarol] = postTransferAC!.balances[assetIdx].amount;

    const transferred = BigNumber.from(transferAmount).mul(2);
    expect(finalAliceB).to.be.eq(BigNumber.from(initAliceB).sub(transferred));
    expect(finalAliceC).to.be.eq(BigNumber.from(initAliceC).sub(transferred));
    expect(finalBob).to.be.eq(BigNumber.from(initBob));
    expect(finalCarol).to.be.eq(BigNumber.from(initCarol));
  });

  it("should work if initiator channel is out of sync", async () => {
    const initial = await aliceStore.getChannelState(abChannelAddress);
    const latest = await depositInChannel(abChannelAddress, alice, aliceSigner, bob, assetId, depositAmount);
    const assetIdx = latest.assetIds.findIndex((a) => a == assetId);

    await aliceStore.saveChannelState(initial!);
    const { channel, transfer } = await createTransfer(
      abChannelAddress,
      alice,
      bob,
      assetId,
      transferAmount,
      undefined,
      latest.balances[assetIdx],
    );

    await runTest(channel, transfer);
    expect(channel.nonce).to.be.eq(initial!.nonce + 2);
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
