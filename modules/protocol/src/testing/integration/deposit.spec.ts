import { expect, getTestLoggers } from "@connext/vector-utils";
import { FullChannelState, IChannelSigner, IVectorProtocol, IVectorStore } from "@connext/vector-types";
import { BigNumber } from "@ethersproject/bignumber";
import { AddressZero } from "@ethersproject/constants";

import { deployChannelIfNeeded, depositInChannel, depositOnchain, getSetupChannel } from "../utils";
import { env } from "../env";
import { CHAIN_ID } from "../constants";

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
    assetIdErc20 = env.chainAddresses[CHAIN_ID].testTokenAddress;

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

  describe("should work if there have been single deposits onchain", () => {
    beforeEach(async () => {
      // Deploy multisig
      await deployChannelIfNeeded(
        preDepositChannel.channelAddress,
        preDepositChannel.bob,
        preDepositChannel.alice,
        aliceSigner,
      );
    });

    it("should deposit eth for Alice (depositA)", async () => {
      // Send alice deposits
      await depositOnchain(
        AddressZero,
        depositAmount,
        preDepositChannel.channelAddress,
        preDepositChannel.aliceIdentifier,
        aliceSigner,
      );
      const finalChannel = await depositInChannel(
        preDepositChannel.channelAddress,
        alice,
        aliceSigner,
        bob,
        AddressZero,
        depositAmount,
      );
      expect(finalChannel.balances[0].amount[0]).to.be.eq(BigNumber.from(depositAmount.mul(2)));
    });

    it("should deposit eth for Bob (multisig deposit)", async () => {
      await depositOnchain(
        AddressZero,
        depositAmount,
        preDepositChannel.channelAddress,
        preDepositChannel.aliceIdentifier,
        bobSigner,
      );
      const finalChannel = await depositInChannel(
        preDepositChannel.channelAddress,
        bob,
        bobSigner,
        alice,
        AddressZero,
        depositAmount,
      );
      expect(finalChannel.balances[0].amount[1]).to.be.eq(BigNumber.from(depositAmount.mul(2)));
    });

    it("should deposit tokens for alice", async () => {
      await depositOnchain(
        assetIdErc20,
        depositAmount,
        preDepositChannel.channelAddress,
        preDepositChannel.aliceIdentifier,
        aliceSigner,
      );
      const finalChannel = await depositInChannel(
        preDepositChannel.channelAddress,
        alice,
        aliceSigner,
        bob,
        assetIdErc20,
        depositAmount,
      );
      expect(finalChannel.balances[0].amount[0]).to.be.eq(BigNumber.from(depositAmount.mul(2)));
    });

    it("should deposit tokens for bob", async () => {
      await depositOnchain(
        assetIdErc20,
        depositAmount,
        preDepositChannel.channelAddress,
        preDepositChannel.aliceIdentifier,
        bobSigner,
      );
      const finalChannel = await depositInChannel(
        preDepositChannel.channelAddress,
        bob,
        bobSigner,
        alice,
        assetIdErc20,
        depositAmount,
      );
      expect(finalChannel.balances[0].amount[1]).to.be.eq(BigNumber.from(depositAmount.mul(2)));
    });
  });

  it("should work after multiple deposits", async () => {
    // Deploy multisig
    await deployChannelIfNeeded(
      preDepositChannel.channelAddress,
      preDepositChannel.bob,
      preDepositChannel.alice,
      aliceSigner,
    );

    // Send alice deposits
    await depositOnchain(
      AddressZero,
      depositAmount,
      preDepositChannel.channelAddress,
      preDepositChannel.aliceIdentifier,
      aliceSigner,
    );
    await depositOnchain(
      assetIdErc20,
      depositAmount,
      preDepositChannel.channelAddress,
      preDepositChannel.aliceIdentifier,
      aliceSigner,
    );
    // Send bob deposits
    await depositOnchain(
      AddressZero,
      depositAmount,
      preDepositChannel.channelAddress,
      preDepositChannel.aliceIdentifier,
      bobSigner,
    );
    await depositOnchain(
      assetIdErc20,
      depositAmount,
      preDepositChannel.channelAddress,
      preDepositChannel.aliceIdentifier,
      bobSigner,
    );

    // Simply reconcile
    await depositInChannel(preDepositChannel.channelAddress, alice, aliceSigner, bob, AddressZero);
    const finalChannel = await depositInChannel(
      preDepositChannel.channelAddress,
      alice,
      aliceSigner,
      bob,
      assetIdErc20,
    );
    const ethIdx = 0;
    const tokenIdx = 1;
    expect(finalChannel.balances[ethIdx].amount[0]).to.be.eq(
      BigNumber.from(preDepositChannel.balances[ethIdx]?.amount[0] ?? 0).add(depositAmount),
    );
    expect(finalChannel.balances[ethIdx].amount[1]).to.be.eq(
      BigNumber.from(preDepositChannel.balances[ethIdx]?.amount[1] ?? 0).add(depositAmount),
    );
    expect(finalChannel.balances[tokenIdx].amount[0]).to.be.eq(
      BigNumber.from(preDepositChannel.balances[tokenIdx]?.amount[0] ?? 0).add(depositAmount),
    );
    expect(finalChannel.balances[tokenIdx].amount[1]).to.be.eq(
      BigNumber.from(preDepositChannel.balances[tokenIdx]?.amount[1] ?? 0).add(depositAmount),
    );
  });

  it("should work concurrently", async () => {
    // Perform an alice deposit to make sure multisig is deployed
    await deployChannelIfNeeded(
      preDepositChannel.channelAddress,
      preDepositChannel.bob,
      preDepositChannel.alice,
      aliceSigner,
    );

    // Have both parties deposit onchain
    await depositOnchain(
      AddressZero,
      depositAmount,
      preDepositChannel.channelAddress,
      preDepositChannel.aliceIdentifier,
      aliceSigner,
    );
    await depositOnchain(
      AddressZero,
      depositAmount,
      preDepositChannel.channelAddress,
      preDepositChannel.aliceIdentifier,
      bobSigner,
    );

    // Both parties reconcile the same asset id simultaneously
    await Promise.all([
      depositInChannel(preDepositChannel.channelAddress, bob, bobSigner, alice, AddressZero),
      depositInChannel(preDepositChannel.channelAddress, alice, aliceSigner, bob, AddressZero),
    ]);

    // Make sure both deposits were accounted for
    const [finalAlice, finalBob] = await Promise.all([
      alice.getChannelState(preDepositChannel.channelAddress),
      bob.getChannelState(preDepositChannel.channelAddress),
    ]);
    expect(finalAlice).to.be.deep.eq(finalBob);
    expect(finalAlice).to.containSubset({
      nonce: preDepositChannel.nonce + 2,
      assetIds: [AddressZero],
      balances: [
        {
          to: [preDepositChannel.alice, preDepositChannel.bob],
          amount: [depositAmount.toString(), depositAmount.toString()],
        },
      ],
      processedDepositsA: [depositAmount.toString()],
      processedDepositsB: [depositAmount.toString()],
    });
  });

  it("should work if initiator channel is out of sync", async () => {
    await depositInChannel(preDepositChannel.channelAddress, alice, aliceSigner, bob, assetId, depositAmount);

    await aliceStore.saveChannelState(preDepositChannel);
    const final = await depositInChannel(
      preDepositChannel.channelAddress,
      alice,
      aliceSigner,
      bob,
      assetId,
      depositAmount,
    );
    expect(final.nonce).to.be.eq(preDepositChannel.nonce + 2);
  });

  it("should work if responder channel is out of sync", async () => {
    await depositInChannel(preDepositChannel.channelAddress, bob, bobSigner, alice, assetId, depositAmount);

    await bobStore.saveChannelState(preDepositChannel);

    const final = await depositInChannel(
      preDepositChannel.channelAddress,
      bob,
      bobSigner,
      alice,
      assetId,
      depositAmount,
    );
    expect(final.nonce).to.be.eq(preDepositChannel.nonce + 2);
  });
});
