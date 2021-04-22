/* eslint-disable @typescript-eslint/no-empty-function */
import { expect, getTestLoggers, mkAddress } from "@connext/vector-utils";
import {
  IVectorProtocol,
  ProtocolEventName,
  IVectorStore,
  IChannelSigner,
  FullTransferState,
  FullChannelState,
} from "@connext/vector-types";
import { AddressZero } from "@ethersproject/constants";
import { BigNumber } from "@ethersproject/bignumber";

import { createTransfer, getFundedChannel, resolveTransfer, depositInChannel } from "../utils";
import { env } from "../env";
import { chainId } from "../constants";
import { getNextNonceForUpdate } from "../../utils";
import { QueuedUpdateError } from "../../errors";

const testName = "Resolve Integrations";
const { log } = getTestLoggers(testName, env.logLevel);
describe(testName, () => {
  let alice: IVectorProtocol;
  let bob: IVectorProtocol;

  let channelAddress: string;
  let aliceSigner: IChannelSigner;
  let bobSigner: IChannelSigner;
  let bobStore: IVectorStore;

  let assetId: string;
  let assetIdErc20: string;
  let transferAmount: any;

  let setupChannel: FullChannelState;

  beforeEach(async () => {
    const setup = await getFundedChannel(testName, [
      {
        assetId: AddressZero,
        amount: ["100", "100"],
      },
      {
        assetId: env.chainAddresses[chainId].testTokenAddress,
        amount: ["100", "100"],
      },
    ]);
    alice = setup.alice.protocol;
    aliceSigner = setup.alice.signer;
    bob = setup.bob.protocol;
    bobSigner = setup.bob.signer;
    bobStore = setup.bob.store;
    channelAddress = setup.channel.channelAddress;

    // Set test constants
    assetId = AddressZero;
    assetIdErc20 = env.chainAddresses[chainId].testTokenAddress;
    transferAmount = "7";

    setupChannel = setup.channel;

    log.info({
      alice: alice.publicIdentifier,
      bob: bob.publicIdentifier,
    });
  });

  afterEach(async () => {
    await alice.off();
    await bob.off();
  });

  const resolveTransferCreatedByAlice = async (transfer: FullTransferState): Promise<void> => {
    const alicePromise = alice.waitFor(ProtocolEventName.CHANNEL_UPDATE_EVENT, 10_000);
    const bobPromise = bob.waitFor(ProtocolEventName.CHANNEL_UPDATE_EVENT, 10_000);
    await resolveTransfer(channelAddress, transfer, bob, alice);

    const aliceEvent = await alicePromise;
    const bobEvent = await bobPromise;
    expect(aliceEvent.updatedChannelState).to.be.deep.eq(bobEvent.updatedChannelState);
    const { meta, ...aliceSanitized } = aliceEvent.updatedTransfer!;
    expect(bobEvent.updatedTransfer).to.containSubset(aliceSanitized);
    expect(bobEvent.updatedTransfers).to.not.containSubset([aliceSanitized]);
    expect(aliceEvent.updatedTransfer!.transferResolver.preImage).to.be.a("string");
    expect(aliceEvent.updatedTransfer?.balance.amount[0]).to.be.eq("0");
    expect(aliceEvent.updatedTransfer?.balance.amount[1]).to.be.eq(transfer.balance.amount[0]);
    expect(bobEvent.updatedTransfer?.balance.amount[0]).to.be.eq("0");
    expect(bobEvent.updatedTransfer?.balance.amount[1]).to.be.eq(transfer.balance.amount[0]);
    expect(aliceEvent.updatedTransfer?.transferState.balance).to.be.deep.eq(transfer.balance);
    expect(bobEvent.updatedTransfer?.transferState.balance).to.be.deep.eq(transfer.balance);
  };

  const resolveTransferCreatedByBob = async (transfer: FullTransferState): Promise<void> => {
    const alicePromise = alice.waitFor(ProtocolEventName.CHANNEL_UPDATE_EVENT, 10_000);
    const bobPromise = bob.waitFor(ProtocolEventName.CHANNEL_UPDATE_EVENT, 10_000);
    await resolveTransfer(channelAddress, transfer, alice, bob);

    const aliceEvent = await alicePromise;
    const bobEvent = await bobPromise;
    expect(aliceEvent.updatedChannelState).to.be.deep.eq(bobEvent.updatedChannelState);
    const { meta, ...aliceSanitized } = aliceEvent.updatedTransfer!;
    expect(bobEvent.updatedTransfer).to.containSubset(aliceSanitized);
    expect(bobEvent.updatedTransfers).to.not.containSubset([aliceSanitized]);
    expect(aliceEvent.updatedTransfer!.transferResolver.preImage).to.be.a("string");
    expect(aliceEvent.updatedTransfer?.balance.amount[0]).to.be.eq("0");
    expect(aliceEvent.updatedTransfer?.balance.amount[1]).to.be.eq(transfer.balance.amount[0]);
    expect(bobEvent.updatedTransfer?.balance.amount[0]).to.be.eq("0");
    expect(bobEvent.updatedTransfer?.balance.amount[1]).to.be.eq(transfer.balance.amount[0]);
    expect(aliceEvent.updatedTransfer?.transferState.balance).to.be.deep.eq(transfer.balance);
    expect(bobEvent.updatedTransfer?.transferState.balance).to.be.deep.eq(transfer.balance);
  };

  it("should work for alice resolving an eth transfer", async () => {
    const { transfer } = await createTransfer(channelAddress, alice, bob, assetId, transferAmount);

    await resolveTransferCreatedByAlice(transfer);
  });

  it("should work for alice resolving a token transfer", async () => {
    const { transfer } = await createTransfer(channelAddress, alice, bob, assetIdErc20, transferAmount);

    await resolveTransferCreatedByAlice(transfer);
  });

  it("should work for alice resolving an eth transfer out of channel", async () => {
    const outsiderPayee = mkAddress("0xc");
    const { transfer } = await createTransfer(channelAddress, alice, bob, assetId, transferAmount, outsiderPayee);
    await resolveTransferCreatedByAlice(transfer);
  });

  it("should work for alice resolving a token transfer out of channel", async () => {
    const outsiderPayee = mkAddress("0xc");
    const { transfer } = await createTransfer(channelAddress, alice, bob, assetIdErc20, transferAmount, outsiderPayee);
    await resolveTransferCreatedByAlice(transfer);
  });

  it("should work for bob resolving an eth transfer", async () => {
    const { transfer } = await createTransfer(channelAddress, bob, alice, assetId, transferAmount);

    await resolveTransferCreatedByBob(transfer);
  });

  it("should work for bob resolving an eth transfer out of channel", async () => {
    const outsiderPayee = mkAddress("0xc");
    const { transfer } = await createTransfer(channelAddress, bob, alice, assetId, transferAmount, outsiderPayee);
    await resolveTransferCreatedByBob(transfer);
  });

  it("should work for bob resolving a token transfer", async () => {
    const { transfer } = await createTransfer(channelAddress, bob, alice, assetIdErc20, transferAmount);
    await resolveTransferCreatedByBob(transfer);
  });

  it("should work for bob resolving a token transfer out of channel", async () => {
    const outsiderPayee = mkAddress("0xc");
    const { transfer } = await createTransfer(channelAddress, bob, alice, assetIdErc20, transferAmount, outsiderPayee);
    await resolveTransferCreatedByBob(transfer);
  });

  it("should work concurrently", async () => {
    // Create two transfers from alice -> bob
    const { transfer: transfer1 } = await createTransfer(channelAddress, alice, bob, assetId, transferAmount);
    const { transfer: transfer2 } = await createTransfer(channelAddress, alice, bob, assetId, transferAmount);

    // Resolve both
    await Promise.all([
      resolveTransfer(channelAddress, transfer1, bob, alice),
      resolveTransfer(channelAddress, transfer2, bob, alice),
    ]);
  });

  it("should work if initiator channel is out of sync", async () => {
    const depositAmount = BigNumber.from("1000");
    const preChannelState = await depositInChannel(channelAddress, alice, aliceSigner, bob, assetId, depositAmount);
    const { transfer, channel } = await createTransfer(channelAddress, alice, bob, assetId, transferAmount);

    await bobStore.saveChannelState(preChannelState);

    // bob is resolver/initiator
    await resolveTransferCreatedByAlice(transfer);
  });

  it("should fail if the initiator needs to restore", async () => {
    const depositAmount = BigNumber.from("1000");
    await depositInChannel(channelAddress, alice, aliceSigner, bob, assetId, depositAmount);
    const { transfer, channel } = await createTransfer(channelAddress, alice, bob, assetId, transferAmount);

    await bobStore.saveChannelState(setupChannel);

    // bob is resolver/initiator
    const result = await bob.resolve({
      channelAddress: channel.channelAddress,
      transferId: transfer.transferId,
      transferResolver: transfer.transferResolver,
    });
    expect(result.isError).to.be.true;
    expect(result.getError()?.message).to.be.eq(QueuedUpdateError.reasons.RestoreNeeded);
  });

  it("should work if responder channel is out of sync", async () => {
    const depositAmount = BigNumber.from("1000");
    const preChannelState = await depositInChannel(channelAddress, bob, bobSigner, alice, assetId, depositAmount);
    const { transfer, channel } = await createTransfer(channelAddress, bob, alice, assetId, transferAmount);

    await bobStore.saveChannelState(preChannelState);

    // alice is resolver/initiator
    await resolveTransferCreatedByBob(transfer);
  });

  it("should fail if the responder needs to restore", async () => {
    const depositAmount = BigNumber.from("1000");
    await depositInChannel(channelAddress, bob, bobSigner, alice, assetId, depositAmount);
    const { transfer } = await createTransfer(channelAddress, bob, alice, assetId, transferAmount);

    await bobStore.saveChannelState(setupChannel);

    // alice is resolver/initiator
    const result = await alice.resolve({
      channelAddress,
      transferId: transfer.transferId,
      transferResolver: transfer.transferResolver,
    });
    expect(result.isError).to.be.true;
    expect(result.getError()?.message).to.be.eq(QueuedUpdateError.reasons.CounterpartyFailure);
    expect(result.getError()?.context.counterpartyError.message).to.be.eq(QueuedUpdateError.reasons.RestoreNeeded);
  });
});
