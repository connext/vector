/* eslint-disable @typescript-eslint/no-empty-function */
import { FullChannelState } from "@connext/vector-types";
import {
  ChannelSigner,
  createTestChannelStateWithSigners,
  expect,
  getRandomAddress,
  getRandomBytes32,
  hashCoreChannelState,
} from "@connext/vector-utils";
import { AddressZero, HashZero } from "@ethersproject/constants";
import { BigNumber, Contract } from "ethers";

import { bob, alice, provider, rando } from "../constants";
import { getTestChannel, mineBlock } from "../utils";

describe.only("CMCAdjudicator.sol", () => {
  let channel: Contract;
  let token: Contract;
  let channelState: FullChannelState;
  let aliceSignature: string;
  let bobSignature: string;

  const aliceSigner = new ChannelSigner(alice.privateKey, provider);
  const bobSigner = new ChannelSigner(bob.privateKey, provider);

  // Helper to verify the channel dispute
  const verifyDispute = async (ccs: FullChannelState, disputeBlockNumber: number) => {
    const dispute = await channel.getChannelDispute();
    expect(dispute.channelStateHash).to.be.eq(hashCoreChannelState(ccs));
    expect(dispute.nonce).to.be.eq(ccs.nonce);
    expect(dispute.merkleRoot).to.be.eq(ccs.merkleRoot);
    expect(dispute.consensusExpiry).to.be.eq(BigNumber.from(ccs.timeout).add(disputeBlockNumber));
    expect(dispute.defundExpiry).to.be.eq(
      BigNumber.from(ccs.timeout)
        .mul(2)
        .add(disputeBlockNumber),
    );
    expect(dispute.defundNonce).to.be.eq(BigNumber.from(ccs.defundNonce).sub(1));
  };

  // Helper to send funds to channel address
  const fundChannel = async (ccs: FullChannelState) => {
    for (const assetId of ccs.assetIds) {
      // Fund channel for bob
      const idx = ccs.assetIds.findIndex(a => a === assetId);
      const depositsB = BigNumber.from(ccs.processedDepositsB[idx]);
      const bobTx =
        assetId === AddressZero
          ? await bob.sendTransaction({ to: channel.address, value: depositsB })
          : await token.connect(bob).transfer(channel.address, depositsB);
      await bobTx.wait();

      const depositsA = BigNumber.from(ccs.processedDepositsA[idx]);
      const aliceTx = await channel.connect(alice).depositAlice(assetId, depositsA);
      await aliceTx.wait();
    }
  };

  beforeEach(async () => {
    channel = await getTestChannel();
    channelState = createTestChannelStateWithSigners([aliceSigner, bobSigner], "deposit", {
      channelAddress: channel.address,
      assetIds: [AddressZero],
      balances: [{ to: [alice.address, bob.address], amount: ["17", "45"] }],
      processedDepositsA: ["0"],
      processedDepositsB: ["62"],
      timeout: "2",
      nonce: 3,
      merkleRoot: HashZero,
    });
    // Deposit all funds into channel
    await fundChannel(channelState);
    const channelHash = hashCoreChannelState(channelState);
    aliceSignature = await aliceSigner.signMessage(channelHash);
    bobSignature = await bobSigner.signMessage(channelHash);
    // make sure channel is connected to rando
    channel = channel.connect(rando);
  });

  describe("disputeChannel", () => {
    it("should fail if state.alice is incorrect", async () => {
      await expect(
        channel.disputeChannel({ ...channelState, alice: getRandomAddress() }, aliceSignature, bobSignature),
      ).revertedWith("CMCAdjudicator: Mismatch between given core channel state and channel we are at");
    });

    it("should fail if state.bob is incorrect", async () => {
      await expect(
        channel.disputeChannel({ ...channelState, bob: getRandomAddress() }, aliceSignature, bobSignature),
      ).revertedWith("CMCAdjudicator: Mismatch between given core channel state and channel we are at");
    });

    it("should fail if state.channelAddress is incorrect", async () => {
      await expect(
        channel.disputeChannel({ ...channelState, channelAddress: getRandomAddress() }, aliceSignature, bobSignature),
      ).revertedWith("CMCAdjudicator: Mismatch between given core channel state and channel we are at");
    });

    it("should fail if alices signature is invalid", async () => {
      await expect(
        channel.disputeChannel(channelState, await aliceSigner.signMessage(getRandomBytes32()), bobSignature),
      ).revertedWith("Invalid alice signature");
    });

    it("should fail if bobs signature is invalid", async () => {
      await expect(
        channel.disputeChannel(channelState, aliceSignature, await bobSigner.signMessage(getRandomBytes32())),
      ).revertedWith("Invalid bob signature");
    });

    it("should fail if channel is not in defund phase", async () => {
      const shortTimeout = { ...channelState, timeout: "2" };
      const hash = hashCoreChannelState(shortTimeout);
      const tx = await channel.disputeChannel(
        shortTimeout,
        await aliceSigner.signMessage(hash),
        await bobSigner.signMessage(hash),
      );
      const { blockNumber } = await tx.wait();
      await verifyDispute(shortTimeout, blockNumber);

      // advance blocks
      await mineBlock();

      const nextState = { ...shortTimeout, nonce: channelState.nonce + 1 };
      const hash2 = hashCoreChannelState(nextState);
      await expect(
        channel.disputeChannel(nextState, await aliceSigner.signMessage(hash2), await bobSigner.signMessage(hash2)),
      ).revertedWith("CMCAdjudicator disputeChannel: Not allowed in defund phase");
    });

    it("should fail if nonce is lte stored nonce", async () => {
      const tx = await channel.disputeChannel(channelState, aliceSignature, bobSignature);
      const { blockNumber } = await tx.wait();
      await verifyDispute(channelState, blockNumber);

      await expect(channel.disputeChannel(channelState, aliceSignature, bobSignature)).revertedWith(
        "CMCAdjudicator disputeChannel: New nonce smaller than stored one",
      );
    });

    it("should work for a newly initiated dispute (and store expiries)", async () => {
      const tx = await channel.disputeChannel(channelState, aliceSignature, bobSignature);
      const { blockNumber } = await tx.wait();
      // Verify dispute
      await verifyDispute(channelState, blockNumber);
    });

    it("should work when advancing dispute (does not update expiries)", async () => {
      const tx = await channel.disputeChannel(channelState, aliceSignature, bobSignature);
      const { blockNumber } = await tx.wait();
      await verifyDispute(channelState, blockNumber);
      // Submit a new, higher nonced state
      const newState = { ...channelState, nonce: channelState.nonce + 1 };
      const hash = hashCoreChannelState(newState);
      const tx2 = await channel.disputeChannel(
        newState,
        await aliceSigner.signMessage(hash),
        await bobSigner.signMessage(hash),
      );
      await tx2.wait();
      // safe because timeout does not change
      await verifyDispute(newState, blockNumber);
    });
  });

  describe("defundChannel", () => {
    // Create a helper to dispute channel
    const disputeChannel = async (ccs: FullChannelState = channelState) => {
      const hash = hashCoreChannelState(ccs);
      const tx = await channel.disputeChannel(
        ccs,
        await aliceSigner.signMessage(hash),
        await bobSigner.signMessage(hash),
      );
      const { blockNumber: disputeBlock } = await tx.wait();
      // Bring to defund phase
      const toMine = BigNumber.from(ccs.timeout).toNumber();
      for (const _ of Array(toMine).fill(0)) {
        await mineBlock();
      }
      const currBlock = await provider.getBlockNumber();
      expect(currBlock).to.be.at.least(BigNumber.from(disputeBlock).add(ccs.timeout));
      const defundTimeout = BigNumber.from(ccs.timeout).mul(2);
      expect(defundTimeout.add(disputeBlock).gt(currBlock)).to.be.true;
    };

    it("should fail if state.alice is incorrect", async () => {
      await disputeChannel();
      await expect(channel.defundChannel({ ...channelState, alice: getRandomAddress() })).revertedWith(
        "CMCAdjudicator: Mismatch between given core channel state and channel we are at",
      );
    });

    it("should fail if state.bob is incorrect", async () => {
      await disputeChannel();
      await expect(channel.defundChannel({ ...channelState, bob: getRandomAddress() })).revertedWith(
        "CMCAdjudicator: Mismatch between given core channel state and channel we are at",
      );
    });

    it("should fail if state.channelAddress is incorrect", async () => {
      await disputeChannel();
      await expect(channel.defundChannel({ ...channelState, channelAddress: getRandomAddress() })).revertedWith(
        "CMCAdjudicator: Mismatch between given core channel state and channel we are at",
      );
    });

    it("should fail if channel state supplied does not match channels state stored", async () => {
      await disputeChannel();
      await expect(channel.defundChannel({ ...channelState, nonce: 652 })).revertedWith(
        "CMCAdjudicator defundChannel: Hash of core channel state does not match stored hash",
      );
    });

    it("should fail if it is not in the defund phase", async () => {
      const tx = await channel.disputeChannel(channelState, aliceSignature, bobSignature);
      const { blockNumber } = await tx.wait();
      await verifyDispute(channelState, blockNumber);
      await expect(channel.defundChannel(channelState)).revertedWith(
        "CMCAdjudicator defundChannel: Not in defund phase",
      );
    });

    it("should fail if defund nonce does not increment", async () => {
      const toDispute = { ...channelState, defundNonce: "0" };
      await disputeChannel(toDispute);
      await expect(channel.defundChannel(toDispute)).revertedWith(
        "CMCAdjudicator defundChannel: channel already defunded",
      );
    });

    it.skip("should work with multiple assets", async () => {});

    it("should work with unprocessed deposits", async () => {
      // Send funds to multisig without reconciling offchain state
      const unprocessed = BigNumber.from(18);
      const bobTx = await bob.sendTransaction({ to: channel.address, value: unprocessed });
      await bobTx.wait();

      // Dispute + defund channel
      const [preDisputeAlice, preDisputeBob] = await Promise.all([aliceSigner.getBalance(), bobSigner.getBalance()]);
      await disputeChannel();
      const tx = await channel.defundChannel(channelState);
      await tx.wait();

      // Verify transfer
      const [postDisputeAlice, postDisputeBob] = await Promise.all([aliceSigner.getBalance(), bobSigner.getBalance()]);
      const assetIdx = channelState.assetIds.findIndex(a => a === AddressZero);
      const diffAlice = postDisputeAlice.sub(preDisputeAlice);
      const diffBob = postDisputeBob.sub(preDisputeBob);
      expect(diffAlice).to.be.eq(channelState.balances[assetIdx].amount[0]);
      expect(diffBob).to.be.eq(unprocessed.add(channelState.balances[assetIdx].amount[1]));
    });

    it("should work (simple case)", async () => {
      const [preDisputeAlice, preDisputeBob] = await Promise.all([aliceSigner.getBalance(), bobSigner.getBalance()]);
      await disputeChannel();
      const tx = await channel.defundChannel(channelState);
      await tx.wait();

      // Verify transfer
      const [postDisputeAlice, postDisputeBob] = await Promise.all([aliceSigner.getBalance(), bobSigner.getBalance()]);
      const assetIdx = channelState.assetIds.findIndex(a => a === AddressZero);
      const diffAlice = postDisputeAlice.sub(preDisputeAlice);
      const diffBob = postDisputeBob.sub(preDisputeBob);
      expect(diffAlice).to.be.eq(channelState.balances[assetIdx].amount[0]);
      expect(diffBob).to.be.eq(channelState.balances[assetIdx].amount[1]);
    });
  });

  describe.skip("disputeTransfer", () => {
    it("should fail if state.channelAddress is incorrect", async () => {});
    it("should fail if merkle proof is invalid", async () => {});
    it("should fail if channel is not in defund phase", async () => {});
    it("should fail if transfer has already been disputed", async () => {});
    it("should work", async () => {});
  });

  describe.skip("defundTransfer", () => {
    it("should fail if state.channelAddress is incorrect", async () => {});
    it("should fail if the transfer does not match whats stored", async () => {});
    it("should fail if transfer hasnt been disputed", async () => {});
    it("should fail if transfer has been defunded", async () => {});
    it("should fail if the responder is not the defunder and the transfer is still in dispute", async () => {});
    it("should fail if the initial state hash doesnt match and the transfer is still in dispute", async () => {});
    it("should fail if the initial state hash doesnt match", async () => {});
    it("should correctly resolve + defund transfer if transfer is still in dispute (cancelling resolve)", async () => {});
    it("should correctly resolve + defund transfer if transfer is still in dispute (successful resolve)", async () => {});
    it("should correctly defund transfer when transfer is not in dispute phase", async () => {});
  });
});
