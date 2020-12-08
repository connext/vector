/* eslint-disable @typescript-eslint/no-empty-function */
import { VectorChannel, TestToken } from "@connext/vector-contracts";
import { expect, getTestLoggers } from "@connext/vector-utils";
import { FullChannelState, IChannelSigner, IVectorProtocol, IVectorStore } from "@connext/vector-types";
import { BigNumber } from "@ethersproject/bignumber";
import { Contract } from "@ethersproject/contracts";
import { AddressZero } from "@ethersproject/constants";

import { depositInChannel, getSetupChannel } from "../utils";
import { env } from "../env";
import { chainId } from "../constants";

const testName = "Deposit Integrations";
const { log } = getTestLoggers(testName, env.logLevel);

describe(testName, () => {
  let alice: IVectorProtocol;
  let bob: IVectorProtocol;
  let preDepositChannel: FullChannelState;

  let aliceSigner: IChannelSigner;
  let aliceStore: IVectorStore;
  let bobSigner: IChannelSigner;
  let bobStore: IVectorStore;

  let depositAmount: BigNumber;
  let assetId: string;
  let assetIdErc20: string;

  afterEach(async () => {
    await alice.off();
    await bob.off();
  });

  beforeEach(async () => {
    const setup = await getSetupChannel(testName);
    alice = setup.alice.protocol;
    bob = setup.bob.protocol;
    preDepositChannel = setup.channel;
    aliceSigner = setup.alice.signer;
    aliceStore = setup.alice.store;
    bobSigner = setup.bob.signer;
    bobStore = setup.alice.store;

    depositAmount = BigNumber.from("1000");
    assetId = AddressZero;
    assetIdErc20 = env.chainAddresses[chainId].testTokenAddress;

    log.info({
      alice: alice.publicIdentifier,
      bob: bob.publicIdentifier,
    });
  });

  describe("should work if there have been no deposits onchain", () => {
    it("should deposit eth for Alice (depositA)", async () => {
      await depositInChannel(preDepositChannel.channelAddress, alice, aliceSigner, bob, assetId, depositAmount);
    });

    it("should deposit eth for Bob (multisig deposit)", async () => {
      await depositInChannel(preDepositChannel.channelAddress, bob, bobSigner, alice, assetId, depositAmount);
    });

    it("should deposit tokens for alice", async () => {
      await depositInChannel(preDepositChannel.channelAddress, alice, aliceSigner, bob, assetIdErc20, depositAmount);
    });

    it("should deposit tokens for bob", async () => {
      await depositInChannel(preDepositChannel.channelAddress, bob, bobSigner, alice, assetIdErc20, depositAmount);
    });
  });

  // TODO: This test is failing
  describe.only("should work if there have been deposits onchain", () => {});
  it.only("should deposit eth for Alice (depositA)", async () => {
    const aliceChannel = new Contract(preDepositChannel.channelAddress, VectorChannel.abi, aliceSigner);
    const tx = await aliceChannel.depositAlice(assetId, depositAmount.div(4), { value: depositAmount.div(4) });
    const event = await tx.wait();

    await depositInChannel(preDepositChannel.channelAddress, alice, aliceSigner, bob, assetId, depositAmount);
  });

  it.only("should deposit eth for Bob (multisig deposit)", async () => {
    const tx = await bobSigner.sendTransaction({ value: depositAmount.div(4), to: preDepositChannel.channelAddress });
    await tx.wait();

    await depositInChannel(preDepositChannel.channelAddress, bob, bobSigner, alice, assetId, depositAmount);
  });

  it.only("should deposit tokens for alice", async () => {
    const aliceChannel = new Contract(preDepositChannel.channelAddress, VectorChannel.abi, aliceSigner);
    const tx = await aliceChannel.depositAlice(assetIdErc20, depositAmount.div(4), { value: depositAmount.div(4) });
    await tx.wait();
    await depositInChannel(preDepositChannel.channelAddress, alice, aliceSigner, bob, assetIdErc20, depositAmount);
  });

  it.only("should deposit tokens for bob", async () => {
    const bobChannel = new Contract(assetIdErc20, TestToken.abi, bobSigner);
    const tx = await bobChannel.transfer(preDepositChannel.channelAddress, depositAmount.div(4));
    await tx.wait();

    await depositInChannel(preDepositChannel.channelAddress, bob, bobSigner, alice, assetIdErc20, depositAmount);
  });

  // TODO: This test is failing
  it.only("should work after multiple deposits", async () => {
    const firstTxB = await bobSigner.sendTransaction({
      value: depositAmount.div(4),
      to: preDepositChannel.channelAddress,
    });
    await firstTxB.wait();

    const bobChannel = new Contract(assetIdErc20, TestToken.abi, bobSigner);
    const secondTxB = await bobChannel.transfer(preDepositChannel.channelAddress, depositAmount.div(4));
    await secondTxB.wait();

    const aliceChannel = new Contract(preDepositChannel.channelAddress, VectorChannel.abi, aliceSigner);
    const firstTxA = await aliceChannel.depositAlice(assetId, depositAmount.div(4), { value: depositAmount.div(4) });
    await firstTxA.wait();
    const SecondTxA = await aliceChannel.depositAlice(assetIdErc20, depositAmount.div(4), {
      value: depositAmount.div(4),
    });
    await SecondTxA.wait();

    await depositInChannel(preDepositChannel.channelAddress, alice, aliceSigner, bob, assetIdErc20, depositAmount);
  });

  it.only("should work concurrently", async () => {
    // Perform an alice deposit to make sure multisig is deployed
    const initialDeposit = await depositInChannel(
      preDepositChannel.channelAddress,
      alice,
      aliceSigner,
      bob,
      assetId,
      depositAmount,
    );

    // Have both parties deposit onchain
    await bobSigner.sendTransaction({ value: depositAmount.div(4), to: preDepositChannel.channelAddress });

    const channel = new Contract(preDepositChannel.channelAddress, VectorChannel.abi, aliceSigner);
    const tx = await channel.depositAlice(assetId, depositAmount.div(4), { value: depositAmount.div(4) });
    await tx.wait();

    // Get the predeposit values
    const { processedDepositsA, processedDepositsB } = initialDeposit;

    await Promise.all([
      depositInChannel(preDepositChannel.channelAddress, bob, bobSigner, alice, assetId),
      depositInChannel(preDepositChannel.channelAddress, alice, aliceSigner, bob, assetId),
    ]);

    // Make sure both deposits were accounted for
    const [finalAlice, finalBob] = await Promise.all([
      alice.getChannelState(preDepositChannel.channelAddress),
      bob.getChannelState(preDepositChannel.channelAddress),
    ]);
    expect(finalAlice).to.be.deep.eq(finalBob);
    expect(finalAlice).to.containSubset({
      processedDepositsA: [depositAmount.div(4).add(processedDepositsA[0]).toString()],
      processedDepositsB: [depositAmount.div(4).add(processedDepositsB[0]).toString()],
    });
  });

  it.only("should work if initiator channel is out of sync", async () => {
    const preChannelState = await depositInChannel(
      preDepositChannel.channelAddress,
      alice,
      aliceSigner,
      bob,
      assetId,
      depositAmount,
    );

    aliceStore.saveChannelState(preChannelState);
    await depositInChannel(preDepositChannel.channelAddress, alice, aliceSigner, bob, assetId, depositAmount);
  });

  it.only("should work if responder channel is out of sync", async () => {
    const preChannelState = await depositInChannel(
      preDepositChannel.channelAddress,
      bob,
      bobSigner,
      alice,
      assetId,
      depositAmount,
    );

    bobStore.saveChannelState(preChannelState);

    await depositInChannel(preDepositChannel.channelAddress, bob, bobSigner, alice, assetId, depositAmount);
  });
});
