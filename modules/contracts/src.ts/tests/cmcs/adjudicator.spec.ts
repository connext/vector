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
  hashChannelCommitment,
  hashCoreChannelState,
  hashCoreTransferState,
  hashTransferState,
} from "@connext/vector-utils";
import { BigNumber, BigNumberish } from "@ethersproject/bignumber";
import { AddressZero, HashZero, Zero } from "@ethersproject/constants";
import { Contract } from "@ethersproject/contracts";
import { keccak256 } from "@ethersproject/keccak256";
import { parseEther } from "@ethersproject/units";
import { MerkleTree } from "merkletreejs";

import { deployContracts } from "../../actions";
import { AddressBook } from "../../addressBook";
import { bob, alice, networkName, provider, rando } from "../constants";
import { advanceBlocktime, getOnchainBalance, getTestAddressBook, getTestChannel } from "../utils";

describe("CMCAdjudicator.sol", async function() {
  this.timeout(120_000);

  // These tests could be running on chains without automining
  // (i.e. matic), and if that is the case all the adjudicator tests
  // with automining should be skipped
  const nonAutomining = networkName !== "hardhat";

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
    const { timestamp } = await provider.getBlock(disputeBlockNumber);
    const dispute = await channel.getChannelDispute();
    expect(dispute.channelStateHash).to.be.eq(hashCoreChannelState(ccs));
    expect(dispute.nonce).to.be.eq(ccs.nonce);
    expect(dispute.merkleRoot).to.be.eq(ccs.merkleRoot);
    expect(dispute.consensusExpiry).to.be.eq(BigNumber.from(ccs.timeout).add(timestamp));
    expect(dispute.defundExpiry).to.be.eq(
      BigNumber.from(ccs.timeout)
        .mul(2)
        .add(timestamp),
    );
    await Promise.all(
      ccs.assetIds.map(async (assetId: string, idx: number) => {
        const defundNonce = await channel.getDefundNonce(assetId);
        expect(defundNonce).to.be.eq(BigNumber.from(ccs.defundNonces[idx]).sub(1));
      }),
    );
  };

  const verifyTransferDispute = async (cts: FullTransferState, disputeBlockNumber: number) => {
    const { timestamp } = await provider.getBlock(disputeBlockNumber);
    const transferDispute = await channel.getTransferDispute(cts.transferId);
    expect(transferDispute.transferStateHash).to.be.eq(hashCoreTransferState(cts));
    expect(transferDispute.isDefunded).to.be.false;
    expect(transferDispute.transferDisputeExpiry).to.be.eq(BigNumber.from(timestamp).add(cts.transferTimeout));
  };

  // Helper to send funds to channel address
  const fundChannel = async (ccs: FullChannelState = channelState) => {
    for (const assetId of ccs.assetIds) {
      // Fund channel for bob
      const idx = ccs.assetIds.findIndex((a: any) => a === assetId);
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
    const hash = hashChannelCommitment(ccs);
    const tx = await channel.disputeChannel(
      ccs,
      await aliceSigner.signMessage(hash),
      await bobSigner.signMessage(hash),
    );
    const { blockNumber: disputeBlock } = await tx.wait();
    const { timestamp } = await provider.getBlock(disputeBlock);
    // Bring to defund phase
    await advanceBlocktime(BigNumber.from(ccs.timeout).toNumber());
    const currBlock = await provider.getBlock("latest");
    expect(currBlock.timestamp).to.be.at.least(BigNumber.from(timestamp).add(ccs.timeout));
    const defundTimeout = BigNumber.from(ccs.timeout).mul(2);
    expect(defundTimeout.add(timestamp).gt(currBlock.timestamp)).to.be.true;
  };

  // Get merkle proof of transfer
  const getMerkleProof = (cts: FullTransferState = transferState) => {
    const hash = hashCoreTransferState(cts);
    const merkle = new MerkleTree([bufferify(hash)], keccak256);
    return merkle.getHexProof(bufferify(hash));
  };

  // Helper to dispute transfers + bring to defund phase
  const disputeTransfer = async (cts: FullTransferState = transferState) => {
    await (await channel.disputeTransfer(cts, getMerkleProof(cts))).wait();
  };

  // Helper to defund channels and verify transfers
  const defundChannelAndVerify = async (
    ccs: FullChannelState = channelState,
    unprocessedAlice: BigNumberish[] = [],
    unprocessedBob: BigNumberish[] = [],
    defundedAssets: string[] = ccs.assetIds,
    indices: BigNumberish[] = [],
  ) => {
    // Handle case where you're defunding more assets than are signed into your channel
    const assetIds = defundedAssets.length > ccs.assetIds.length ? defundedAssets : ccs.assetIds;
    // Get pre-defund balances for signers
    const preDefundAlice = await Promise.all<BigNumber>(
      assetIds.map((assetId: string) => getOnchainBalance(assetId, alice.address)),
    );
    const preDefundBob = await Promise.all<BigNumber>(
      assetIds.map((assetId: string) => getOnchainBalance(assetId, bob.address)),
    );
    // Defund channel
    await (await channel.defundChannel(ccs, defundedAssets, indices)).wait();
    // Withdraw all assets from channel
    for (let i = 0; i < assetIds.length; i++) {
      const assetId = assetIds[i];
      if ((await channel.getEmergencyWithdrawableAmount(assetId, alice.address)).gt(Zero)) {
        await (await channel.emergencyWithdraw(assetId, alice.address, alice.address)).wait();
      }
      if ((await channel.getEmergencyWithdrawableAmount(assetId, bob.address)).gt(Zero)) {
        await (await channel.emergencyWithdraw(assetId, bob.address, bob.address)).wait();
      }
    }
    // Get post-defund balances
    const postDefundAlice = await Promise.all<BigNumber>(
      assetIds.map((assetId: string) => getOnchainBalance(assetId, alice.address)),
    );
    const postDefundBob = await Promise.all<BigNumber>(
      assetIds.map((assetId: string) => getOnchainBalance(assetId, bob.address)),
    );
    // Verify change in balances + defund nonce
    await Promise.all(
      assetIds.map(async (assetId: string) => {
        const defunded = defundedAssets.includes(assetId);
        const inChannel = ccs.assetIds.includes(assetId);
        const idx = inChannel
          ? ccs.assetIds.findIndex((a: string) => a === assetId)
          : assetIds.findIndex((a: string) => a === assetId);
        const defundNonce = await channel.getDefundNonce(assetId);
        if (defunded && inChannel) {
          expect(BigNumber.from(ccs.defundNonces[idx])).to.be.eq(defundNonce);
        } else if (!defunded) {
          expect(defundNonce).to.be.eq(BigNumber.from(ccs.defundNonces[idx]).sub(1));
        } else if (!inChannel && defunded) {
          expect(defundNonce).to.be.eq(1);
        }
        const diffAlice = postDefundAlice[idx].sub(preDefundAlice[idx]);
        const diffBob = postDefundBob[idx].sub(preDefundBob[idx]);
        if (inChannel) {
          expect(diffAlice).to.be.eq(
            defunded ? BigNumber.from(ccs.balances[idx].amount[0]).add(unprocessedAlice[idx] ?? "0") : 0,
          );
          expect(diffBob).to.be.eq(
            defunded ? BigNumber.from(ccs.balances[idx].amount[1]).add(unprocessedBob[idx] ?? "0") : 0,
          );
        } else {
          expect(diffAlice).to.be.eq(unprocessedAlice[idx] ?? "0");
          expect(diffBob).to.be.eq(unprocessedBob[idx] ?? "0");
        }
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
    await (await token.mint(alice.address, parseEther("1"))).wait();
    await (await token.mint(bob.address, parseEther("1"))).wait();
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
    channelState = createTestChannelStateWithSigners([aliceSigner, bobSigner], "create", {
      channelAddress: channel.address,
      assetIds: [AddressZero],
      balances: [{ to: [alice.address, bob.address], amount: ["17", "45"] }],
      processedDepositsA: ["0"],
      processedDepositsB: ["62"],
      timeout: "20",
      nonce: 3,
      merkleRoot: new MerkleTree([hashCoreTransferState(transferState)], keccak256).getHexRoot(),
    });
    const channelHash = hashChannelCommitment(channelState);
    aliceSignature = await aliceSigner.signMessage(channelHash);
    bobSignature = await bobSigner.signMessage(channelHash);
    // make sure channel is connected to rando
    channel = channel.connect(rando);
  });

  describe("disputeChannel", () => {
    it("should fail if state.alice is incorrect", async function() {
      await expect(
        channel.disputeChannel({ ...channelState, alice: getRandomAddress() }, aliceSignature, bobSignature),
      ).revertedWith("CMCAdjudicator: INVALID_CHANNEL");
    });

    it("should fail if state.bob is incorrect", async function() {
      await expect(
        channel.disputeChannel({ ...channelState, bob: getRandomAddress() }, aliceSignature, bobSignature),
      ).revertedWith("CMCAdjudicator: INVALID_CHANNEL");
    });

    it("should fail if state.channelAddress is incorrect", async function() {
      await expect(
        channel.disputeChannel({ ...channelState, channelAddress: getRandomAddress() }, aliceSignature, bobSignature),
      ).revertedWith("CMCAdjudicator: INVALID_CHANNEL");
    });

    it("should fail if alices signature is invalid", async function() {
      await expect(
        channel.disputeChannel(channelState, await aliceSigner.signMessage(getRandomBytes32()), bobSignature),
      ).revertedWith("CMCAdjudicator: INVALID_ALICE_SIG");
    });

    it("should fail if bobs signature is invalid", async function() {
      await expect(
        channel.disputeChannel(channelState, aliceSignature, await bobSigner.signMessage(getRandomBytes32())),
      ).revertedWith("CMCAdjudicator: INVALID_BOB_SIG");
    });

    it("should fail if channel is not in defund phase", async function() {
      if (nonAutomining) {
        this.skip();
      }
      const shortTimeout = { ...channelState, timeout: "2" };
      const hash = hashChannelCommitment(shortTimeout);
      const tx = await channel.disputeChannel(
        shortTimeout,
        await aliceSigner.signMessage(hash),
        await bobSigner.signMessage(hash),
      );
      const { blockNumber } = await tx.wait();

      await verifyChannelDispute(shortTimeout, blockNumber);

      // advance blocks
      await advanceBlocktime(BigNumber.from(shortTimeout.timeout).toNumber());

      const nextState = { ...shortTimeout, nonce: channelState.nonce + 1 };
      const hash2 = hashChannelCommitment(nextState);
      await expect(
        channel.disputeChannel(nextState, await aliceSigner.signMessage(hash2), await bobSigner.signMessage(hash2)),
      ).revertedWith("CMCAdjudicator: INVALID_PHASE");
    });

    it("should fail if nonce is lte stored nonce", async () => {
      const tx = await channel.disputeChannel(channelState, aliceSignature, bobSignature);
      const { blockNumber } = await tx.wait();
      await verifyChannelDispute(channelState, blockNumber);

      await expect(channel.disputeChannel(channelState, aliceSignature, bobSignature)).revertedWith(
        "CMCAdjudicator: INVALID_NONCE",
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
      const hash = hashChannelCommitment(newState);
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
      await expect(
        channel.defundChannel({ ...channelState, alice: getRandomAddress() }, channelState.assetIds, []),
      ).revertedWith("CMCAdjudicator: INVALID_CHANNEL");
    });

    it("should fail if state.bob is incorrect", async function() {
      if (nonAutomining) {
        this.skip();
      }
      await disputeChannel();
      await expect(
        channel.defundChannel({ ...channelState, bob: getRandomAddress() }, channelState.assetIds, []),
      ).revertedWith("CMCAdjudicator: INVALID_CHANNEL");
    });

    it("should fail if state.channelAddress is incorrect", async function() {
      if (nonAutomining) {
        this.skip();
      }
      await disputeChannel();
      await expect(
        channel.defundChannel({ ...channelState, channelAddress: getRandomAddress() }, channelState.assetIds, []),
      ).revertedWith("CMCAdjudicator: INVALID_CHANNEL");
    });

    it("should fail if channel state supplied does not match channels state stored", async function() {
      if (nonAutomining) {
        this.skip();
      }
      await disputeChannel();
      await expect(channel.defundChannel({ ...channelState, nonce: 652 }, channelState.assetIds, [])).revertedWith(
        "CMCAdjudicator: INVALID_CHANNEL_HASH",
      );
    });

    it("should fail if it is not in the defund phase", async function() {
      if (nonAutomining) {
        this.skip();
      }
      const tx = await channel.disputeChannel(channelState, aliceSignature, bobSignature);
      const { blockNumber } = await tx.wait();
      await verifyChannelDispute(channelState, blockNumber);
      await expect(channel.defundChannel(channelState, channelState.assetIds, [])).revertedWith(
        "CMCAdjudicator: INVALID_PHASE",
      );
    });

    it("should fail if defund nonce does not increment", async function() {
      if (nonAutomining) {
        this.skip();
      }
      const toDispute = { ...channelState, defundNonces: channelState.assetIds.map(() => "0") };
      await disputeChannel(toDispute);
      await expect(channel.defundChannel(toDispute, toDispute.assetIds, [])).revertedWith(
        "CMCAdjudicator: CHANNEL_ALREADY_DEFUNDED",
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
        defundNonces: ["1", "1"],
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

    it("should fail if providing invalid inidices to defund", async function() {
      if (nonAutomining) {
        this.skip();
      }
      const multiAsset = {
        ...channelState,
        assetIds: [AddressZero, token.address],
        defundNonces: ["1", "1"],
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
      await expect(channel.defundChannel(multiAsset, [AddressZero], [BigNumber.from(1)])).revertedWith(
        "CMCAdjudicator: INDEX_MISMATCH",
      );
    });

    it("should work with multiple assets in channel, but only defunding one", async function() {
      if (nonAutomining) {
        this.skip();
      }
      const multiAsset = {
        ...channelState,
        assetIds: [AddressZero, token.address],
        defundNonces: ["1", "1"],
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
      await defundChannelAndVerify(multiAsset, [], [], [AddressZero], []);
    });

    it("should work if providing inidices to defund", async function() {
      if (nonAutomining) {
        this.skip();
      }
      const multiAsset = {
        ...channelState,
        assetIds: [AddressZero, token.address],
        defundNonces: ["1", "1"],
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
      await defundChannelAndVerify(multiAsset, [], [], [AddressZero], [BigNumber.from(0)]);
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

    it("should work with unprocessed deposits of a new asset", async function() {
      if (nonAutomining) {
        this.skip();
      }
      const onlyTokens = {
        ...channelState,
        assetIds: [token.address],
      };
      // Deposit all funds into channel
      await fundChannel(onlyTokens);
      // Send funds to multisig without reconciling offchain state
      const unprocessed = BigNumber.from(18);
      const bobTx = await bob.sendTransaction({ to: onlyTokens.channelAddress, value: unprocessed });
      await bobTx.wait();

      // Dispute + defund channel
      await disputeChannel(onlyTokens);
      await defundChannelAndVerify(onlyTokens, [], ["0", unprocessed], [token.address, AddressZero]);
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
      ).revertedWith("CMCAdjudicator: INVALID_TRANSFER");
    });

    it("should fail if merkle proof is invalid", async function() {
      if (nonAutomining) {
        this.skip();
      }
      await disputeChannel();
      await expect(
        channel.disputeTransfer({ ...transferState, transferId: getRandomBytes32() }, getMerkleProof()),
      ).revertedWith("CMCAdjudicator: INVALID_MERKLE_PROOF");
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
        "CMCAdjudicator: INVALID_PHASE",
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
        "CMCAdjudicator: TRANSFER_ALREADY_DISPUTED",
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
      ).revertedWith("CMCAdjudicator: INVALID_TRANSFER");
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
      ).revertedWith("CMCAdjudicator: TRANSFER_NOT_DISPUTED");
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
      ).revertedWith("CMCAdjudicator: INVALID_TRANSFER_HASH");
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
      ).revertedWith("CMCAdjudicator: TRANSFER_ALREADY_DEFUNDED");
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
      ).revertedWith("CMCAdjudicator: INVALID_MSG_SENDER");
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
      ).revertedWith("CMCAdjudicator: INVALID_TRANSFER_HASH");
    });

    // TODO: need to write a transfer def for this
    // it.skip("should fail if the resolved balances are > initial balances", async () => {});

    it("should correctly resolve + defund transfer if transfer is still in dispute (cancelling resolve)", async function() {
      if (nonAutomining) {
        this.skip();
      }
      await prepTransferForDefund();
      const preDefundAlice = await getOnchainBalance(transferState.assetId, alice.address);
      await (
        await channel
          .connect(bob)
          .defundTransfer(
            transferState,
            encodeTransferState(transferState.transferState, transferState.transferEncodings[0]),
            encodeTransferResolver({ preImage: HashZero }, transferState.transferEncodings[1]),
          )
      ).wait();
      await (await channel.emergencyWithdraw(transferState.assetId, alice.address, alice.address)).wait();
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
      await (
        await channel
          .connect(bob)
          .defundTransfer(
            transferState,
            encodeTransferState(transferState.transferState, transferState.transferEncodings[0]),
            encodeTransferResolver(transferState.transferResolver, transferState.transferEncodings[1]),
          )
      ).wait();
      await (
        await channel.emergencyWithdraw(transferState.assetId, transferState.balance.to[1], transferState.balance.to[1])
      ).wait();
      expect(await getOnchainBalance(transferState.assetId, alice.address)).to.be.eq(preDefundAlice);
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
      await advanceBlocktime(BigNumber.from(transferState.transferTimeout).toNumber());

      await (
        await channel
          .connect(bob)
          .defundTransfer(
            transferState,
            encodeTransferState(transferState.transferState, transferState.transferEncodings[0]),
            encodeTransferResolver(transferState.transferResolver, transferState.transferEncodings[1]),
          )
      ).wait();
      await (await channel.emergencyWithdraw(transferState.assetId, alice.address, alice.address)).wait();
      const postDefundAlice = await getOnchainBalance(transferState.assetId, alice.address);
      expect(postDefundAlice).to.be.eq(preDefundAlice.add(transferState.balance.amount[0]));
      expect(await getOnchainBalance(transferState.assetId, transferState.balance.to[1])).to.be.eq(0);
    });
  });
});
