/* eslint-disable @typescript-eslint/no-empty-function */
import { FullChannelState, FullTransferState, HashlockTransferStateEncoding } from "@connext/vector-types";
import {
  bufferify,
  ChannelSigner,
  createlockHash,
  createTestChannelStateWithSigners,
  createTestFullHashlockTransferState,
  encodeTransferResolver,
  encodeTransferState,
  expect,
  getRandomAddress,
  getRandomBytes32,
  hashCoreChannelState,
  hashCoreTransferState,
  hashTransferState,
} from "@connext/vector-utils";
import { BigNumber, BigNumberish } from "@ethersproject/bignumber";
import { AddressZero, HashZero } from "@ethersproject/constants";
import { Contract } from "@ethersproject/contracts";
import { keccak256 } from "@ethersproject/keccak256";
import { parseEther } from "@ethersproject/units";
import { MerkleTree } from "merkletreejs";

import { deployContracts } from "../../actions";
import { AddressBook } from "../../addressBook";
import { bob, alice, provider, rando } from "../constants";
import { getOnchainBalance, getTestAddressBook, getTestChannel, mineBlock } from "../utils";

describe("CMCAdjudicator.sol", function() {
  this.timeout(120_000);

  // These tests could be running on chains without automining
  // (i.e. matic), and if that is the case all the adjudicator tests
  // with automining should be skipped
  const nonAutomining = process.env.EVM && !["hardhat", "ganache"].includes(process.env.EVM);

  let channel: Contract;
  let token: Contract;
  let transferDefinition: Contract;
  let addressBook: AddressBook;
  let channelState: FullChannelState;
  let transferState: FullTransferState;
  let aliceSignature: string;
  let bobSignature: string;

  const aliceSigner = new ChannelSigner(alice.privateKey, provider);
  const bobSigner = new ChannelSigner(bob.privateKey, provider);

  // Helper to verify the channel dispute
  const verifyChannelDispute = async (ccs: FullChannelState, disputeBlockNumber: number) => {
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

  const verifyTransferDispute = async (cts: FullTransferState, disputeBlockNumber: number) => {
    const hash = hashCoreTransferState(cts);
    const transferDispute = await channel.getTransferDispute(cts.transferId);
    expect(transferDispute.transferStateHash).to.be.eq(hash);
    expect(transferDispute.isDefunded).to.be.false;
    expect(transferDispute.transferDisputeExpiry).to.be.eq(BigNumber.from(disputeBlockNumber).add(cts.transferTimeout));
  };

  // Helper to send funds to channel address
  const fundChannel = async (ccs: FullChannelState = channelState) => {
    for (const assetId of ccs.assetIds) {
      // Fund channel for bob
      const idx = ccs.assetIds.findIndex(a => a === assetId);
      const depositsB = BigNumber.from(ccs.processedDepositsB[idx]);
      if (!depositsB.isZero()) {
        const bobTx =
          assetId === AddressZero
            ? await bob.sendTransaction({ to: channel.address, value: depositsB })
            : await token.connect(bob).transfer(channel.address, depositsB);
        await bobTx.wait();
      }

      const depositsA = BigNumber.from(ccs.processedDepositsA[idx]);
      if (!depositsA.isZero()) {
        const aliceTx = await channel.connect(alice).depositAlice(assetId, depositsA);
        await aliceTx.wait();
      }
    }
  };

  // Create a helper to dispute channel + bring to defund phase
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
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    for (const _ of Array(toMine).fill(0)) {
      await mineBlock();
    }
    const currBlock = await provider.getBlockNumber();
    expect(currBlock).to.be.at.least(BigNumber.from(disputeBlock).add(ccs.timeout));
    const defundTimeout = BigNumber.from(ccs.timeout).mul(2);
    expect(defundTimeout.add(disputeBlock).gt(currBlock)).to.be.true;
  };

  // Get merkle proof of transfer
  const getMerkleProof = (cts: FullTransferState = transferState) => {
    const hash = hashCoreTransferState(cts);
    const merkle = new MerkleTree([bufferify(hash)], keccak256);
    return merkle.getHexProof(bufferify(hash));
  };

  // Helper to dispute transfers + bring to defund phase
  const disputeTransfer = async (cts: FullTransferState = transferState) => {
    const tx = await channel.disputeTransfer(cts, getMerkleProof(cts));
    await tx.wait();
  };

  // Helper to defund channels and verify transfers
  const defundChannelAndVerify = async (
    ccs: FullChannelState = channelState,
    unprocessedAlice: BigNumberish[] = [],
    unprocessedBob: BigNumberish[] = [],
  ) => {
    // Get pre-defund balances for signers
    const preDefundAlice = await Promise.all(ccs.assetIds.map(assetId => getOnchainBalance(assetId, alice.address)));
    const preDefundBob = await Promise.all(ccs.assetIds.map(assetId => getOnchainBalance(assetId, bob.address)));

    // Defund channel
    const tx = await channel.defundChannel(ccs);
    await tx.wait();

    // Get post-defund balances
    const postDefundAlice = await Promise.all(ccs.assetIds.map(assetId => getOnchainBalance(assetId, alice.address)));
    const postDefundBob = await Promise.all(ccs.assetIds.map(assetId => getOnchainBalance(assetId, bob.address)));

    // Verify change in balances
    await Promise.all(
      ccs.assetIds.map(async (assetId, idx) => {
        const diffAlice = postDefundAlice[idx].sub(preDefundAlice[idx]);
        const diffBob = postDefundBob[idx].sub(preDefundBob[idx]);
        expect(diffAlice).to.be.eq(BigNumber.from(ccs.balances[idx].amount[0]).add(unprocessedAlice[idx] ?? "0"));
        expect(diffBob).to.be.eq(BigNumber.from(ccs.balances[idx].amount[1]).add(unprocessedBob[idx] ?? "0"));
      }),
    );
  };

  beforeEach(async () => {
    addressBook = await getTestAddressBook();
    await deployContracts(alice, addressBook, [
      ["TestToken", []],
      ["HashlockTransfer", []],
    ]);
    token = addressBook.getContract("TestToken");
    transferDefinition = addressBook.getContract("HashlockTransfer");
    // mint token to alice/bob
    const aliceMint = await token.mint(alice.address, parseEther("1"));
    await aliceMint.wait();
    const bobMint = await token.mint(bob.address, parseEther("1"));
    await bobMint.wait();
    channel = await getTestChannel(addressBook);
    const preImage = getRandomBytes32();
    const state = {
      lockHash: createlockHash(preImage),
      expiry: "0",
    };
    transferState = createTestFullHashlockTransferState({
      initiator: alice.address,
      responder: bob.address,
      transferDefinition: transferDefinition.address,
      assetId: AddressZero,
      channelAddress: channel.address,
      // use random receiver addr to verify transfer when bob must dispute
      balance: { to: [alice.address, getRandomAddress()], amount: ["7", "0"] },
      transferState: state,
      transferResolver: { preImage },
      transferTimeout: "3",
      initialStateHash: hashTransferState(state, HashlockTransferStateEncoding),
    });
    const hash = hashCoreTransferState(transferState);
    const merkle = new MerkleTree([hash], keccak256);
    channelState = createTestChannelStateWithSigners([aliceSigner, bobSigner], "create", {
      channelAddress: channel.address,
      assetIds: [AddressZero],
      balances: [{ to: [alice.address, bob.address], amount: ["17", "45"] }],
      processedDepositsA: ["0"],
      processedDepositsB: ["62"],
      timeout: "2",
      nonce: 3,
      merkleRoot: merkle.getHexRoot(),
    });
    const channelHash = hashCoreChannelState(channelState);
    aliceSignature = await aliceSigner.signMessage(channelHash);
    bobSignature = await bobSigner.signMessage(channelHash);
    // make sure channel is connected to rando
    channel = channel.connect(rando);
  });

  describe("disputeChannel", () => {
    it("should fail if state.alice is incorrect", async function() {
      await expect(
        channel.disputeChannel({ ...channelState, alice: getRandomAddress() }, aliceSignature, bobSignature),
      ).revertedWith("CMCAdjudicator: Mismatch between given core channel state and channel we are at");
    });

    it("should fail if state.bob is incorrect", async function() {
      await expect(
        channel.disputeChannel({ ...channelState, bob: getRandomAddress() }, aliceSignature, bobSignature),
      ).revertedWith("CMCAdjudicator: Mismatch between given core channel state and channel we are at");
    });

    it("should fail if state.channelAddress is incorrect", async function() {
      await expect(
        channel.disputeChannel({ ...channelState, channelAddress: getRandomAddress() }, aliceSignature, bobSignature),
      ).revertedWith("CMCAdjudicator: Mismatch between given core channel state and channel we are at");
    });

    it("should fail if alices signature is invalid", async function() {
      await expect(
        channel.disputeChannel(channelState, await aliceSigner.signMessage(getRandomBytes32()), bobSignature),
      ).revertedWith("Invalid alice signature");
    });

    it("should fail if bobs signature is invalid", async function() {
      await expect(
        channel.disputeChannel(channelState, aliceSignature, await bobSigner.signMessage(getRandomBytes32())),
      ).revertedWith("Invalid bob signature");
    });

    it("should fail if channel is not in defund phase", async function() {
      if (nonAutomining) {
        this.skip();
      }
      const shortTimeout = { ...channelState, timeout: "2" };
      const hash = hashCoreChannelState(shortTimeout);
      const tx = await channel.disputeChannel(
        shortTimeout,
        await aliceSigner.signMessage(hash),
        await bobSigner.signMessage(hash),
      );
      const { blockNumber } = await tx.wait();
      await verifyChannelDispute(shortTimeout, blockNumber);

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
      await verifyChannelDispute(channelState, blockNumber);

      await expect(channel.disputeChannel(channelState, aliceSignature, bobSignature)).revertedWith(
        "CMCAdjudicator disputeChannel: New nonce smaller than stored one",
      );
    });

    it("should work for a newly initiated dispute (and store expiries)", async () => {
      const tx = await channel.disputeChannel(channelState, aliceSignature, bobSignature);
      const { blockNumber } = await tx.wait();
      // Verify dispute
      await verifyChannelDispute(channelState, blockNumber);
    });

    it("should work when advancing dispute (does not update expiries)", async function() {
      if (nonAutomining) {
        this.skip();
      }
      const tx = await channel.disputeChannel(channelState, aliceSignature, bobSignature);
      const { blockNumber } = await tx.wait();
      await verifyChannelDispute(channelState, blockNumber);
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
      await verifyChannelDispute(newState, blockNumber);
    });
  });

  describe("defundChannel", () => {
    it("should fail if state.alice is incorrect", async function() {
      if (nonAutomining) {
        this.skip();
      }
      await disputeChannel();
      await expect(channel.defundChannel({ ...channelState, alice: getRandomAddress() })).revertedWith(
        "CMCAdjudicator: Mismatch between given core channel state and channel we are at",
      );
    });

    it("should fail if state.bob is incorrect", async function() {
      if (nonAutomining) {
        this.skip();
      }
      await disputeChannel();
      await expect(channel.defundChannel({ ...channelState, bob: getRandomAddress() })).revertedWith(
        "CMCAdjudicator: Mismatch between given core channel state and channel we are at",
      );
    });

    it("should fail if state.channelAddress is incorrect", async function() {
      if (nonAutomining) {
        this.skip();
      }
      await disputeChannel();
      await expect(channel.defundChannel({ ...channelState, channelAddress: getRandomAddress() })).revertedWith(
        "CMCAdjudicator: Mismatch between given core channel state and channel we are at",
      );
    });

    it("should fail if channel state supplied does not match channels state stored", async function() {
      if (nonAutomining) {
        this.skip();
      }
      await disputeChannel();
      await expect(channel.defundChannel({ ...channelState, nonce: 652 })).revertedWith(
        "CMCAdjudicator defundChannel: Hash of core channel state does not match stored hash",
      );
    });

    it("should fail if it is not in the defund phase", async function() {
      if (nonAutomining) {
        this.skip();
      }
      const tx = await channel.disputeChannel(channelState, aliceSignature, bobSignature);
      const { blockNumber } = await tx.wait();
      await verifyChannelDispute(channelState, blockNumber);
      await expect(channel.defundChannel(channelState)).revertedWith(
        "CMCAdjudicator defundChannel: Not in defund phase",
      );
    });

    it("should fail if defund nonce does not increment", async function() {
      if (nonAutomining) {
        this.skip();
      }
      const toDispute = { ...channelState, defundNonce: "0" };
      await disputeChannel(toDispute);
      await expect(channel.defundChannel(toDispute)).revertedWith(
        "CMCAdjudicator defundChannel: channel already defunded",
      );
    });

    it("should work (simple case)", async function() {
      if (nonAutomining) {
        this.skip();
      }
      // Deposit all funds into channel
      await fundChannel(channelState);
      await disputeChannel();
      await defundChannelAndVerify();
    });

    it("should work with multiple assets", async function() {
      if (nonAutomining) {
        this.skip();
      }
      const multiAsset = {
        ...channelState,
        assetIds: [AddressZero, token.address],
        balances: [
          { to: [alice.address, bob.address], amount: ["17", "26"] },
          { to: [alice.address, bob.address], amount: ["10", "8"] },
        ],
        processedDepositsA: ["0", "0"],
        processedDepositsB: ["43", "18"],
      };
      // Deposit all funds into channel
      await fundChannel(multiAsset);
      await disputeChannel(multiAsset);
      await defundChannelAndVerify(multiAsset);
    });

    it("should work with unprocessed deposits", async function() {
      if (nonAutomining) {
        this.skip();
      }
      // Deposit all funds into channel
      await fundChannel(channelState);
      // Send funds to multisig without reconciling offchain state
      const unprocessed = BigNumber.from(18);
      const bobTx = await bob.sendTransaction({ to: channel.address, value: unprocessed });
      await bobTx.wait();

      // Dispute + defund channel
      await disputeChannel();
      await defundChannelAndVerify(channelState, [], [unprocessed]);
    });
  });

  describe("disputeTransfer", () => {
    it("should fail if state.channelAddress is incorrect", async function() {
      if (nonAutomining) {
        this.skip();
      }
      await disputeChannel();
      await expect(
        channel.disputeTransfer({ ...transferState, channelAddress: getRandomAddress() }, getMerkleProof()),
      ).revertedWith("CMCAdjudicator: Mismatch between given core transfer state and channel we are at");
    });

    it("should fail if merkle proof is invalid", async function() {
      if (nonAutomining) {
        this.skip();
      }
      await disputeChannel();
      await expect(
        channel.disputeTransfer({ ...transferState, transferId: getRandomBytes32() }, getMerkleProof()),
      ).revertedWith("CMCAdjudicator: Merkle proof verification failed");
    });

    it("should fail if channel is not in defund phase", async function() {
      if (nonAutomining) {
        this.skip();
      }
      // Don't use helper here because will automatically bring into
      // the defund phase
      const tx = await channel.disputeChannel(channelState, aliceSignature, bobSignature);
      await tx.wait();
      await expect(channel.disputeTransfer(transferState, getMerkleProof())).revertedWith(
        "CMCAdjudicator disputeTransfer: Not in defund phase",
      );
    });

    it("should fail if transfer has already been disputed", async function() {
      if (nonAutomining) {
        this.skip();
      }
      const longerTimeout = { ...channelState, timeout: "4" };
      await disputeChannel(longerTimeout);
      const tx = await channel.disputeTransfer(transferState, getMerkleProof());
      await tx.wait();
      await expect(channel.disputeTransfer(transferState, getMerkleProof())).revertedWith(
        "CMCAdjudicator disputeTransfer: transfer already disputed",
      );
    });

    it("should work", async function() {
      if (nonAutomining) {
        this.skip();
      }
      await disputeChannel();
      const tx = await channel.disputeTransfer(transferState, getMerkleProof());
      const { blockNumber } = await tx.wait();
      await verifyTransferDispute(transferState, blockNumber);
    });
  });

  describe("defundTransfer", () => {
    const prepTransferForDefund = async (
      ccs: FullChannelState = channelState,
      cts: FullTransferState = transferState,
    ) => {
      await fundChannel(ccs);
      await disputeChannel(ccs);
      await disputeTransfer(cts);
    };

    it("should fail if state.channelAddress is incorrect", async function() {
      if (nonAutomining) {
        this.skip();
      }
      await prepTransferForDefund();
      await expect(
        channel.defundTransfer(
          { ...transferState, channelAddress: getRandomAddress() },
          encodeTransferState(transferState.transferState, transferState.transferEncodings[0]),
          encodeTransferResolver(transferState.transferResolver!, transferState.transferEncodings[1]),
        ),
      ).revertedWith("CMCAdjudicator: Mismatch between given core transfer state and channel we are at");
    });

    it("should fail if transfer hasnt been disputed", async function() {
      if (nonAutomining) {
        this.skip();
      }
      await fundChannel();
      await disputeChannel();
      await expect(
        channel.defundTransfer(
          transferState,
          encodeTransferState(transferState.transferState, transferState.transferEncodings[0]),
          encodeTransferResolver(transferState.transferResolver!, transferState.transferEncodings[1]),
        ),
      ).revertedWith("CMCAdjudicator defundTransfer: transfer not yet disputed");
    });

    it("should fail if the transfer does not match whats stored", async function() {
      if (nonAutomining) {
        this.skip();
      }
      await prepTransferForDefund();
      await expect(
        channel.defundTransfer(
          { ...transferState, initialStateHash: getRandomBytes32() },
          encodeTransferState(transferState.transferState, transferState.transferEncodings[0]),
          encodeTransferResolver(transferState.transferResolver!, transferState.transferEncodings[1]),
        ),
      ).revertedWith("CMCAdjudicator defundTransfer: Hash of core transfer state does not match stored hash");
    });

    it("should fail if transfer has been defunded", async function() {
      if (nonAutomining) {
        this.skip();
      }
      await prepTransferForDefund();
      const tx = await channel
        .connect(bob)
        .defundTransfer(
          transferState,
          encodeTransferState(transferState.transferState, transferState.transferEncodings[0]),
          encodeTransferResolver(transferState.transferResolver!, transferState.transferEncodings[1]),
        );
      await tx.wait();
      await expect(
        channel
          .connect(bob)
          .defundTransfer(
            transferState,
            encodeTransferState(transferState.transferState, transferState.transferEncodings[0]),
            encodeTransferResolver(transferState.transferResolver!, transferState.transferEncodings[1]),
          ),
      ).revertedWith("CMCAdjudicator defundTransfer: transfer already defunded");
    });

    // NOTE: this means no watchtowers can dispute transfers where receiver
    // is owed funds
    it("should fail if the responder is not the defunder and the transfer is still in dispute", async function() {
      if (nonAutomining) {
        this.skip();
      }
      await prepTransferForDefund();
      await expect(
        channel
          .connect(rando)
          .defundTransfer(
            transferState,
            encodeTransferState(transferState.transferState, transferState.transferEncodings[0]),
            encodeTransferResolver(transferState.transferResolver!, transferState.transferEncodings[1]),
          ),
      ).revertedWith("CMCAdjudicator: msg.sender is not transfer responder");
    });

    it("should fail if the initial state hash doesnt match and the transfer is still in dispute", async function() {
      if (nonAutomining) {
        this.skip();
      }
      await prepTransferForDefund();
      await expect(
        channel
          .connect(bob)
          .defundTransfer(
            transferState,
            encodeTransferState(
              { ...transferState.transferState, lockHash: getRandomBytes32() },
              transferState.transferEncodings[0],
            ),
            encodeTransferResolver({ preImage: HashZero }, transferState.transferEncodings[1]),
          ),
      ).revertedWith(
        "CMCAdjudicator defundTransfer: Hash of encoded initial transfer state does not match stored hash",
      );
    });

    // TODO: need to write a transfer def for this
    it.skip("should fail if the resolved balances are > initial balances", async () => {});

    it("should correctly resolve + defund transfer if transfer is still in dispute (cancelling resolve)", async function() {
      if (nonAutomining) {
        this.skip();
      }
      await prepTransferForDefund();
      const preDefundAlice = await getOnchainBalance(transferState.assetId, alice.address);
      const tx = await channel
        .connect(bob)
        .defundTransfer(
          transferState,
          encodeTransferState(transferState.transferState, transferState.transferEncodings[0]),
          encodeTransferResolver({ preImage: HashZero }, transferState.transferEncodings[1]),
        );
      await tx.wait();
      expect(await getOnchainBalance(transferState.assetId, alice.address)).to.be.eq(
        preDefundAlice.add(transferState.balance.amount[0]),
      );
      expect(await getOnchainBalance(transferState.assetId, transferState.balance.to[1])).to.be.eq(0);
    });

    it("should correctly resolve + defund transfer if transfer is still in dispute (successful resolve)", async function() {
      if (nonAutomining) {
        this.skip();
      }
      await prepTransferForDefund();
      const preDefundAlice = await getOnchainBalance(transferState.assetId, alice.address);
      const tx = await channel
        .connect(bob)
        .defundTransfer(
          transferState,
          encodeTransferState(transferState.transferState, transferState.transferEncodings[0]),
          encodeTransferResolver(transferState.transferResolver, transferState.transferEncodings[1]),
        );
      await tx.wait();
      const postDefundAlice = await getOnchainBalance(transferState.assetId, alice.address);
      expect(postDefundAlice).to.be.eq(preDefundAlice);
      expect(await getOnchainBalance(transferState.assetId, transferState.balance.to[1])).to.be.eq(
        transferState.balance.amount[0],
      );
    });

    it("should correctly defund transfer when transfer is not in dispute phase", async function() {
      if (nonAutomining) {
        this.skip();
      }
      await prepTransferForDefund();
      const preDefundAlice = await getOnchainBalance(transferState.assetId, alice.address);
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      for (const _ of Array(BigNumber.from(transferState.transferTimeout).toNumber()).fill(0)) {
        await mineBlock();
      }
      const tx = await channel
        .connect(bob)
        .defundTransfer(
          transferState,
          encodeTransferState(transferState.transferState, transferState.transferEncodings[0]),
          encodeTransferResolver(transferState.transferResolver, transferState.transferEncodings[1]),
        );
      await tx.wait();
      const postDefundAlice = await getOnchainBalance(transferState.assetId, alice.address);
      expect(postDefundAlice).to.be.eq(preDefundAlice.add(transferState.balance.amount[0]));
      expect(await getOnchainBalance(transferState.assetId, transferState.balance.to[1])).to.be.eq(0);
    });
  });
});
