import { LinkedTransfer, ChannelFactory } from "@connext/vector-contracts";
import {
  IEngineStore,
  JsonRpcProvider,
  UpdateType,
  ChannelUpdateError,
  LinkedTransferStateEncoding,
  LinkedTransferResolverEncoding,
} from "@connext/vector-types";
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
  createLinkedHash,
  encodeLinkedTransferResolver,
  encodeLinkedTransferState,
  createTestUpdateParams,
  ChannelSigner,
} from "@connext/vector-utils";
import { expect } from "chai";
import { constants, Contract, utils } from "ethers";

import { applyUpdate, generateUpdate } from "../../src/update";
import { MerkleTree } from "../merkleTree";

import { config } from "./services/config";
import { MemoryStoreService } from "./services/store";

const { hexlify, randomBytes } = utils;

// Should test that the application of an update results in the correct
// final state. While this function *will* fail if validation fails,
// the validation function is tested elsewhere
describe("applyUpdate", () => {
  const chainProviders = config.chainProviders;
  const [chainIdStr, providerUrl] = Object.entries(chainProviders)[0] as string[];
  const provider = new JsonRpcProvider(providerUrl);
  const signers = Array(2)
    .fill(0)
    .map((v) => getRandomChannelSigner(providerUrl));

  let store: IEngineStore;
  let linkedTransferDefinition: string;

  beforeEach(() => {
    store = new MemoryStoreService();
    linkedTransferDefinition = global["networkContext"].linkedTransferDefinition;
  });

  it("should fail for an unrecognized update type", async () => {
    const update = createTestChannelUpdate(UpdateType.setup, {
      type: "fail" as any,
      nonce: 1,
    });
    const state = createTestChannelState(UpdateType.setup, { nonce: 0 });

    const ret = await applyUpdate(update, state, store);
    expect(ret.isError).to.be.true;
    expect(ret.getError()?.message).to.be.eq(ChannelUpdateError.reasons.BadUpdateType);
  });

  it("should work for setup", async () => {
    const state = createTestChannelStateWithSigners(signers, UpdateType.setup, { nonce: 0 });
    const update = createTestChannelUpdateWithSigners(signers, UpdateType.setup, { nonce: 1 });

    const newState = (await applyUpdate(update, state, store)).getValue();
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
      latestUpdate: update,
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

    const newState = (await applyUpdate(update, state, store)).getValue();
    expect(newState).to.containSubset({
      ...state,
      nonce: update.nonce,
      latestDepositNonce: update.details.latestDepositNonce,
      balances: [balance],
      assetIds: [assetId],
      latestUpdate: update,
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

    const newState = (await applyUpdate(update, state, store)).getValue();
    expect(newState).to.containSubset({
      ...state,
      nonce: update.nonce,
      latestDepositNonce: update.details.latestDepositNonce,
      balances: [update.balance],
      latestUpdate: update,
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

    const newState = (await applyUpdate(update, state, store)).getValue();
    expect(newState).to.containSubset({
      ...state,
      balances: [{ ...transferInitialState.balance, amount: ["0", "0"] }],
      lockedValue: [{ amount: "1" }],
      nonce: update.nonce,
      merkleRoot: update.details.merkleRoot,
      latestUpdate: update,
    });
  });

  it("should work for resolve", async () => {
    const preImage = hexlify(randomBytes(32));
    const linkedHash = createLinkedHash(preImage);
    const transferInitialState = createTestLinkedTransferState({
      balance: { to: signers.map((s) => s.address), amount: ["1", "0"] },
      linkedHash,
    });
    const assetId = constants.AddressZero;

    const ret = await new Contract(linkedTransferDefinition, LinkedTransfer.abi, provider).resolve(
      encodeLinkedTransferState(transferInitialState),
      encodeLinkedTransferResolver({ preImage }),
    );
    const balance = {
      to: ret.to,
      amount: ret.amount.map((a) => a.toString()),
    };

    // Create the channel state
    const state = createTestChannelStateWithSigners(signers, UpdateType.deposit, {
      nonce: 3,
      lockedValue: [{ amount: "1" }],
      balances: [{ to: signers.map((s) => s.address), amount: ["0", "0"] }],
      assetIds: [assetId],
      latestDepositNonce: 1,
    });

    // Create the transfer update
    const coreState = createCoreTransferState({ initialStateHash: hashLinkedTransferState(transferInitialState) });
    const emptyTree = new MerkleTree([]);
    const update = createTestChannelUpdateWithSigners(signers, UpdateType.resolve, {
      nonce: state.nonce + 1,
      assetId,
      balance,
      details: {
        transferId: coreState.transferId,
        transferEncodings: coreState.transferEncodings,
        transferDefinition: coreState.transferDefinition,
        transferResolver: { preImage },
        merkleRoot: emptyTree.root,
      },
    });

    // Load the store
    await store.saveChannelState(state);
    await store.saveTransferToChannel(state.channelAddress, coreState, transferInitialState);

    const newState = (await applyUpdate(update, state, store)).getValue();
    expect(newState).to.containSubset({
      ...state,
      balances: [{ ...transferInitialState.balance, amount: ["1", "0"] }],
      lockedValue: [{ amount: "0" }],
      nonce: update.nonce,
      merkleRoot: emptyTree.root,
      latestUpdate: update,
    });
  });
});

describe.only("generateUpdate", () => {
  const chainProviders = config.chainProviders;
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [chainIdStr, providerUrl] = Object.entries(chainProviders)[0] as string[];
  const provider = new JsonRpcProvider(providerUrl);

  let signers: ChannelSigner[];
  let store: IEngineStore;
  let linkedTransferDefinition: string;
  let channelAddress: string;

  beforeEach(async () => {
    signers = Array(2)
      .fill(0)
      .map((v) => getRandomChannelSigner(providerUrl));
    store = new MemoryStoreService();
    linkedTransferDefinition = global["networkContext"].linkedTransferDefinition;

    // Deploy multisig
    // TODO: in engine deployment?
    const factory = new Contract(
      global["networkContext"].channelFactoryAddress,
      ChannelFactory.abi,
      global["wallet"].connect(provider),
    );
    const created = new Promise((resolve) => {
      factory.once(factory.filters.ChannelCreation(), (data) => {
        resolve(data);
      });
    });
    const tx = await factory.createChannel(signers[0].address, signers[1].address);
    await tx.wait();
    channelAddress = (await created) as string;
  });

  it("should work for setup", async () => {
    const params = createTestUpdateParams(UpdateType.setup, {
      details: { counterpartyIdentifier: signers[1].publicIdentifier, networkContext: { ...global["networkContext"] } },
    });
    const update = (await generateUpdate(params, store, signers[0])).getValue();
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { signatures, ...expected } = createTestChannelUpdateWithSigners(signers, UpdateType.setup, {
      balance: { to: signers.map((a) => a.address), amount: ["0", "0"] },
      details: { networkContext: { ...params.details.networkContext }, timeout: params.details.timeout },
    });
    expect(update).to.containSubset(expected);
    expect(update.signatures.filter((x) => !!x).length).to.be.eq(1);
  });

  it("should work for deposit", async () => {
    // First, deploy a multisig
    const state = createTestChannelStateWithSigners(signers, UpdateType.setup, {
      nonce: 1,
      balances: [],
      assetIds: [],
      latestDepositNonce: 0,
      channelAddress,
    });
    await store.saveChannelState(state);
    const params = createTestUpdateParams(UpdateType.deposit, {
      channelAddress,
      details: { amount: "1", channelAddress },
    });
    const update = (await generateUpdate(params, store, signers[0])).getValue();
    const { signatures, ...expected } = createTestChannelUpdateWithSigners(signers, UpdateType.deposit, {
      channelAddress,
      details: { latestDepositNonce: 0 },
      nonce: state.nonce + 1,
    });
    expect(update).to.containSubset(expected);
    expect(update.signatures.filter((x) => !!x).length).to.be.eq(1);
  });

  it("should work for create", async () => {
    const transferInitialState = createTestLinkedTransferState({
      balance: { to: signers.map((s) => s.address), amount: ["1", "0"] },
    });
    const assetId = constants.AddressZero;

    // Create the channel state
    const state = createTestChannelStateWithSigners(signers, UpdateType.deposit, {
      channelAddress,
      nonce: 3,
      lockedValue: [],
      balances: [transferInitialState.balance],
      assetIds: [assetId],
      latestDepositNonce: 1,
    });
    await store.saveChannelState(state);

    // Create the params
    const params = createTestUpdateParams(UpdateType.create, {
      channelAddress,
      details: {
        amount: "1",
        transferDefinition: linkedTransferDefinition,
        transferInitialState,
        encodings: [LinkedTransferStateEncoding, LinkedTransferResolverEncoding],
      },
    });

    // Test update
    const update = (await generateUpdate(params, store, signers[0])).getValue();

    // Get expected value
    const { signatures, ...expected } = createTestChannelUpdateWithSigners(signers, UpdateType.create, {
      channelAddress,
      nonce: state.nonce + 1,
      assetId,
      balance: { to: signers.map((s) => s.address), amount: ["0", "0"] },
      details: {
        transferDefinition: linkedTransferDefinition,
        transferEncodings: params.details.encodings,
        transferInitialState,
        transferTimeout: "1",
      },
    });
    // DONT compare merkle values (don't know transfer id)
    expect(update).to.containSubset({
      ...expected,
      details: {
        ...expected.details,
        transferId: (update.details as any).transferId,
        merkleRoot: (update.details as any).merkleRoot,
        merkleProofData: (update.details as any).merkleProofData,
      },
    });
    expect(update.signatures.filter((x) => !!x).length).to.be.eq(1);
  });

  it("should work for resolve", async () => {
    const preImage = hexlify(randomBytes(32));
    const linkedHash = createLinkedHash(preImage);
    const transferInitialState = createTestLinkedTransferState({
      balance: { to: signers.map((s) => s.address), amount: ["1", "0"] },
      linkedHash,
    });
    const assetId = constants.AddressZero;

    const ret = await new Contract(linkedTransferDefinition, LinkedTransfer.abi, provider).resolve(
      encodeLinkedTransferState(transferInitialState),
      encodeLinkedTransferResolver({ preImage }),
    );
    const balance = {
      to: ret.to,
      amount: ret.amount.map((a) => a.toString()),
    };

    // Create the channel state
    const state = createTestChannelStateWithSigners(signers, UpdateType.deposit, {
      channelAddress,
      nonce: 3,
      lockedValue: [{ amount: "1" }],
      balances: [{ to: signers.map((s) => s.address), amount: ["0", "0"] }],
      assetIds: [assetId],
      latestDepositNonce: 1,
    });

    // Create the transfer core
    const coreState = createCoreTransferState({ 
      initialBalance: transferInitialState.balance,
      initialStateHash: hashLinkedTransferState(transferInitialState),
      channelAddress,
      transferDefinition: linkedTransferDefinition,
    });

    // Create the resolve params
    const params = createTestUpdateParams(UpdateType.resolve, {
      channelAddress,
      details: {
        channelAddress,
        transferId: coreState.transferId,
        transferResolver: { preImage },
      },
    });

    // Load the store
    await store.saveChannelState(state);
    await store.saveTransferToChannel(state.channelAddress, coreState, transferInitialState);

    // Get expected values
    const emptyTree = new MerkleTree([]);
    const { signatures, ...expected } = createTestChannelUpdateWithSigners(signers, UpdateType.resolve, {
      channelAddress,
      nonce: state.nonce + 1,
      assetId,
      balance,
      details: {
        transferId: coreState.transferId,
        transferEncodings: coreState.transferEncodings,
        transferDefinition: coreState.transferDefinition,
        transferResolver: { preImage },
        merkleRoot: emptyTree.root,
      },
    });

    // Generate the update
    const update = (await generateUpdate(params, store, signers[0])).getValue();
    expect(update).to.containSubset(expected);
  });
});
