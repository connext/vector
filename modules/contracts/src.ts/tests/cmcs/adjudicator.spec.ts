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

import { bob, alice, provider } from "../constants";
import { getTestChannel, mineBlock } from "../utils";

describe.only("CMCAdjudicator.sol", () => {
  let channel: Contract;
  let channelState: FullChannelState;
  let aliceSignature: string;
  let bobSignature: string;

  const aliceSigner = new ChannelSigner(alice.privateKey, provider);
  const bobSigner = new ChannelSigner(bob.privateKey, provider);

  beforeEach(async () => {
    channel = (await getTestChannel()).connect(alice);
  });

  // Helper to verify the channel dispute
  const verifyDispute = async (ccs: FullChannelState, disputeBlockNumber: number) => {
    console.log("submitted block", disputeBlockNumber);
    const dispute = await channel.getChannelDispute();
    expect(dispute.channelStateHash).to.be.eq(hashCoreChannelState(ccs));
    expect(dispute.nonce).to.be.eq(ccs.nonce);
    expect(dispute.merkleRoot).to.be.eq(ccs.merkleRoot);
    expect(dispute.consensusExpiry).to.be.eq(BigNumber.from(ccs.timeout).add(disputeBlockNumber));
    console.log("consensus expiry", dispute.consensusExpiry.toNumber());
    console.log("defund expiry", dispute.defundExpiry.toNumber());
    expect(dispute.defundExpiry).to.be.eq(
      BigNumber.from(ccs.timeout)
        .mul(2)
        .add(disputeBlockNumber),
    );
    expect(dispute.defundNonce).to.be.eq(BigNumber.from(ccs.defundNonce).sub(1));
  };

  describe.only("disputeChannel", () => {
    beforeEach(async () => {
      channelState = createTestChannelStateWithSigners([aliceSigner, bobSigner], "deposit", {
        channelAddress: channel.address,
        assetIds: [AddressZero],
        balances: [{ to: [alice.address, bob.address], amount: ["17", "45"] }],
        processedDepositsA: ["20"],
        processedDepositsB: ["42"],
        timeout: "2",
        nonce: 3,
        merkleRoot: HashZero,
      });
      const channelHash = hashCoreChannelState(channelState);
      aliceSignature = await aliceSigner.signMessage(channelHash);
      bobSignature = await bobSigner.signMessage(channelHash);
    });

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

    it.only("should fail if channel is not in defund phase", async () => {
      const shortTimeout = { ...channelState, timeout: "1" };
      const hash = hashCoreChannelState(shortTimeout);
      const tx = await channel.disputeChannel(
        shortTimeout,
        await aliceSigner.signMessage(hash),
        await bobSigner.signMessage(hash),
      );
      const { blockNumber } = await tx.wait();
      await verifyDispute(shortTimeout, blockNumber);

      // advance blocks
      console.log("current block", await provider.getBlockNumber());
      await mineBlock();
      // await mineBlock();
      // await mineBlock();
      console.log("final block", await provider.getBlockNumber());

      const nextState = { ...shortTimeout, nonce: channelState.nonce + 1 };
      const hash2 = hashCoreChannelState(nextState);
      await expect(
        channel.disputeChannel(nextState, await aliceSigner.signMessage(hash2), await bobSigner.signMessage(hash2)),
      ).revertedWith("merp");
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

  describe.skip("defundChannel", () => {
    it("should fail if state.alice is incorrect", async () => {});
    it("should fail if state.bob is incorrect", async () => {});
    it("should fail if state.channelAddress is incorrect", async () => {});
    it("should fail if channel state supplied does not match channels state stored", async () => {});
    it("should fail if defund nonce does not increment", async () => {});
    it("should work with multiple assets", async () => {});
    it("should work with unprocessed deposits", async () => {});
    it("should work (simple case)", async () => {});
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
