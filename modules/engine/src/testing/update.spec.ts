import { IEngineStore, UpdateType } from "@connext/vector-types";
import {
  getRandomChannelSigner,
  createTestChannelState,
  createTestChannelUpdate,
  mkAddress,
  mkHash,
  createTestChannelStateWithSigners,
  createTestChannelUpdateWithSigners,
  createTestLinkedTransferState,
  hashLinkedTransferState,
  createCoreTransferState,
  hashCoreTransferState,
} from "@connext/vector-utils";
import { expect } from "chai";
import { constants } from "ethers";

import { applyUpdate } from "../../src/update";
import { MerkleTree } from "../merkleTree";

import { config } from "./services/config";
import { MemoryStoreService } from "./services/store";

// Should test that the application of an update results in the correct
// final state. While this function *will* fail if validation fails,
// the validation function is tested elsewhere
describe.only("applyUpdate", () => {
  const chainProviders = config.chainProviders;
  const [providerUrl] = Object.values(chainProviders) as string[];
  const signers = Array(2)
    .fill(0)
    .map((v) => getRandomChannelSigner(providerUrl));

  let store: IEngineStore;

  beforeEach(() => {
    store = new MemoryStoreService();
  });

  it("should fail for an unrecognized update type", async () => {
    const update = createTestChannelUpdate(UpdateType.setup, {
      type: "fail" as any,
      nonce: 1,
    });
    const state = createTestChannelState(UpdateType.setup, { nonce: 0 });

    await expect(applyUpdate(update, state, store)).to.be.rejectedWith(`Unexpected UpdateType in received update`);
  });

  it("should work for setup", async () => {
    const state = createTestChannelStateWithSigners(signers, UpdateType.setup, { nonce: 0 });
    const update = createTestChannelUpdateWithSigners(signers, UpdateType.setup, { nonce: 1 });

    const newState = await applyUpdate(update, state, store);
    expect(newState).to.containSubset({
      ...state,
      publicIdentifiers: state.publicIdentifiers,
      nonce: 1,
      latestDepositNonce: 0,
      channelAddress: update.channelAddress,
      timeout: update.details.timeout,
      participants: signers.map((s) => s.address),
      balances: [],
      lockedValue: [],
      assetIds: [],
      merkleRoot: mkHash(),
      latestUpdate: undefined,
      networkContext: update.details.networkContext,
    });
  });

  it("should work for deposit (adding a new assetId)", async () => {
    const state = createTestChannelStateWithSigners(signers, UpdateType.setup, {
      nonce: 1,
      balances: [],
      assetIds: [],
      latestDepositNonce: 0,
    });
    const assetId = mkAddress();
    const balance = {
      to: signers.map((s) => s.address),
      amount: ["1", "0"],
    };
    const update = createTestChannelUpdateWithSigners(signers, UpdateType.deposit, {
      nonce: 2,
      balance,
      assetId,
      details: { latestDepositNonce: 1 },
    });

    const newState = await applyUpdate(update, state, store);
    expect(newState).to.containSubset({
      ...state,
      nonce: update.nonce,
      latestDepositNonce: update.details.latestDepositNonce,
      balances: [balance],
      assetIds: [assetId],
    });
  });

  it("should work for deposit (existing assetId)", async () => {
    const initialBalanceAmt = ["1", "0"];
    const state = createTestChannelStateWithSigners(signers, UpdateType.deposit, {
      nonce: 3,
      balances: [{ to: signers.map((s) => s.address), amount: initialBalanceAmt }],
      assetIds: [mkAddress()],
      latestDepositNonce: 1,
    });

    const update = createTestChannelUpdateWithSigners(signers, UpdateType.deposit, {
      nonce: 4,
      balance: { amount: ["1", "1"], to: signers.map((s) => s.address) },
      assetId: mkAddress(),
      fromIdentifier: signers[1].publicIdentifier,
      toIdentifier: signers[0].publicIdentifier,
      details: { latestDepositNonce: 1 },
    });

    const newState = await applyUpdate(update, state, store);
    expect(newState).to.containSubset({
      ...state,
      nonce: update.nonce,
      latestDepositNonce: update.details.latestDepositNonce,
      balances: [update.balance],
    });
  });

  it("should work for create", async () => {
    const transferInitialState = createTestLinkedTransferState({
      balance: { to: signers.map((s) => s.address), amount: ["1", "0"] },
    });
    const assetId = constants.AddressZero;

    // Create the channel state
    const state = createTestChannelStateWithSigners(signers, UpdateType.deposit, {
      nonce: 3,
      lockedValue: [],
      balances: [transferInitialState.balance],
      assetIds: [assetId],
      latestDepositNonce: 1,
    });

    // Create the transfer update
    const coreState = createCoreTransferState({ initialStateHash: hashLinkedTransferState(transferInitialState) });
    const hash = hashCoreTransferState(coreState);
    const tree = new MerkleTree([hash]);
    const update = createTestChannelUpdateWithSigners(signers, UpdateType.create, {
      nonce: state.nonce + 1,
      assetId,
      balance: transferInitialState.balance,
      details: {
        ...coreState,
        transferInitialState, 
        merkleRoot: tree.root, 
        merkleProofData: tree.proof(hash),
      },
    });

    const newState = await applyUpdate(update, state, store);
    expect(newState).to.containSubset({
      ...state,
      balances: [{ ...transferInitialState.balance, amount: ["0", "0"] }],
      lockedValue: [{ amount: "1" }],
      nonce: update.nonce,
      merkleRoot: update.details.merkleRoot,
    });
  });

  // it("should work for resolve", () => {});

  // it("should fail for resolve if the initial state is not included", () => {});
});

// describe("generateUpdate", () => {});
