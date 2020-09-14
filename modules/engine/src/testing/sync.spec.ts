import {
  ChannelSigner,
  getRandomChannelSigner,
  createTestChannelUpdateWithSigners,
  createVectorChannelMessage,
  createVectorErrorMessage,
  createTestChannelStateWithSigners,
  createTestLinkedTransferState, createCoreTransferState, hashCoreTransferState, hashLinkedTransferState,
} from "@connext/vector-utils";
import {
  IEngineStore,
  IMessagingService,
  FullChannelState,
  ChannelUpdateError,
  UpdateType,
} from "@connext/vector-types";
import { constants } from "ethers";
import { expect } from "chai";
import { Evt } from "evt";

import { inbound } from "../sync";
import { MerkleTree } from "../merkleTree";

import { config } from "./services/config";
import { MemoryStoreService } from "./services/store";
import { MemoryMessagingService } from "./services/messaging";

describe("inbound", () => {
  const chainProviders = config.chainProviders;
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [chainIdStr, providerUrl] = Object.entries(chainProviders)[0] as string[];
  const stateEvt = new Evt<FullChannelState>();
  const errorEvt = new Evt<ChannelUpdateError>();

  let signers: ChannelSigner[];
  let store: IEngineStore;
  let messaging: IMessagingService;

  beforeEach(async () => {
    signers = Array(2)
      .fill(0)
      .map((v) => getRandomChannelSigner(providerUrl));
    store = new MemoryStoreService();
    messaging = new MemoryMessagingService();
  });

  it("should return undefined if message is from us", async () => {
    const message = createVectorChannelMessage({ from: signers[0].publicIdentifier });
    const res = await inbound(message, store, messaging, signers[0], chainProviders, stateEvt, errorEvt);
    expect(res.isError).to.be.false;
    expect(res.getValue()).to.be.undefined;
  });

  it("should return undefined if message is malformed", async () => {
    const message = { should: "fail" } as any;
    const res = await inbound(message, store, messaging, signers[0], chainProviders, stateEvt, errorEvt);
    expect(res.isError).to.be.false;
    expect(res.getValue()).to.be.undefined;
  });

  it("should post to evt if receives an error message", async () => {
    const message = createVectorErrorMessage();
    const [event, res] = await Promise.all([
      errorEvt.waitFor((e) => e.message === message.error.message, 5_000),
      inbound(message, store, messaging, signers[0], chainProviders, stateEvt, errorEvt),
    ]);
    expect(res.isError).to.be.true;
    expect(event).to.be.instanceOf(ChannelUpdateError);
    expect(event).to.containSubset(message.error);
  });

  it("should work if there is no channel state stored and you are receiving a setup update", async () => {
    const update = createTestChannelUpdateWithSigners(signers, UpdateType.setup, { nonce: 1 });
    const message = createVectorChannelMessage({
      from: signers[0].publicIdentifier,
      to: signers[1].publicIdentifier,
      data: { update },
    });
    const [event, res] = await Promise.all([
      stateEvt.waitFor((e) => e.channelAddress === update.channelAddress, 5_000),
      inbound(message, store, messaging, signers[1], chainProviders, stateEvt, errorEvt),
    ]);
    expect(res.isError).to.be.false;

    // Make sure whats in the store lines up with whats emitted
    const storedState = await store.getChannelState(update.channelAddress);
    const storedCommitment = await store.getChannelCommitment(update.channelAddress);

    // TODO: stronger assertions!
    // Verify stored data
    expect(storedState).to.containSubset(event);
    expect(storedCommitment).to.be.ok;
    expect(storedCommitment!.signatures.filter(x => !!x).length).to.be.eq(2);
  });

  it("should return an error if the update does not advance state", async () => {
    // Load store with channel at nonce = 1
    const channel = createTestChannelStateWithSigners(signers, UpdateType.setup, { nonce: 1 });
    await store.saveChannelState(channel, {} as any);

    // Generate an update at nonce = 1
    const update = createTestChannelUpdateWithSigners(signers, UpdateType.setup, { nonce: 1 });

    // Create the message
    const message = createVectorChannelMessage({
      from: signers[0].publicIdentifier,
      to: signers[1].publicIdentifier,
      data: { update },
    });

    // Call `inbound`
    const [event, res] = await Promise.all([
      errorEvt.waitFor(5_000),
      inbound(message, store, messaging, signers[1], chainProviders, stateEvt, errorEvt),
    ]);
    expect(res.isError).to.be.true;

    // Make sure store was not updated
    const stored = await store.getChannelState(channel.channelAddress);
    expect(stored).to.containSubset(channel);

    // Verify error includes update from store
    expect(event).to.be.instanceOf(ChannelUpdateError);
    expect(event.message).to.be.eq(ChannelUpdateError.reasons.StaleUpdateNonce);
    expect(event.update).to.containSubset(channel.latestUpdate);
  });

  it("should work if stored state is behind (update nonce = stored nonce + 2)", async () => {
    // Load store with channel at nonce = 1
    const channel = createTestChannelStateWithSigners(signers, UpdateType.setup, { nonce: 1 });
    await store.saveChannelState(channel, {} as any);

    // Create the update to sync with (in this case, a deposit)
    const toSync = createTestChannelUpdateWithSigners(signers, UpdateType.deposit, { nonce: 2 });

    // Create the update to propose (a create)
    const transferInitialState = createTestLinkedTransferState({
      balance: { to: signers.map((s) => s.address), amount: ["1", "0"] },
    });
    const assetId = constants.AddressZero;
    const coreState = createCoreTransferState({ initialStateHash: hashLinkedTransferState(transferInitialState) });
    const hash = hashCoreTransferState(coreState);
    const tree = new MerkleTree([hash]);
    const update = createTestChannelUpdateWithSigners(signers, UpdateType.create, {
      nonce: 3,
      assetId,
      balance: transferInitialState.balance,
      details: {
        ...coreState,
        transferInitialState,
        merkleRoot: tree.root,
        merkleProofData: tree.proof(hash),
      },
    });

    // Create the message
    const message = createVectorChannelMessage({
      from: signers[0].publicIdentifier,
      to: signers[1].publicIdentifier,
      data: { update, latestUpdate: toSync },
    });

     // Call `inbound`
     const [event, res] = await Promise.all([
      stateEvt.waitFor(e => e.nonce === update.nonce),
      inbound(message, store, messaging, signers[1], chainProviders, stateEvt, errorEvt),
    ]);
    expect(res.isError).to.be.false;

    // Make sure whats in the store lines up with whats emitted
    const storedState = await store.getChannelState(update.channelAddress);
    const storedCommitment = await store.getChannelCommitment(update.channelAddress);

    // TODO: stronger assertions!
    // Verify stored data
    expect(storedState).to.containSubset(event);
    expect(storedState?.nonce).to.be.eq(update.nonce);
    expect(storedCommitment).to.be.ok;
    expect(storedCommitment!.signatures.filter(x => !!x).length).to.be.eq(2);
  });

  it("should update if stored state is in sync", async () => {
    // Load store with channel at nonce = 1
    const channel = createTestChannelStateWithSigners(signers, UpdateType.setup, { nonce: 1 });
    await store.saveChannelState(channel, {} as any);

    // Create the update to sync with (in this case, a deposit)
    const update = createTestChannelUpdateWithSigners(signers, UpdateType.deposit, { nonce: 2 });

    // Create the message
    const message = createVectorChannelMessage({
      from: signers[0].publicIdentifier,
      to: signers[1].publicIdentifier,
      data: { update, latestUpdate: channel.latestUpdate },
    });

    // Call `inbound`
    const [event, res] = await Promise.all([
      stateEvt.waitFor(e => e.nonce === update.nonce),
      inbound(message, store, messaging, signers[1], chainProviders, stateEvt, errorEvt),
    ]);
    expect(res.isError).to.be.false;

    // Make sure whats in the store lines up with whats emitted
    const storedState = await store.getChannelState(update.channelAddress);
    const storedCommitment = await store.getChannelCommitment(update.channelAddress);

    // TODO: stronger assertions!
    // Verify stored data
    expect(storedState).to.containSubset(event);
    expect(storedState?.nonce).to.be.eq(update.nonce);
    expect(storedCommitment).to.be.ok;
    expect(storedCommitment!.signatures.filter(x => !!x).length).to.be.eq(2);
  });
});
