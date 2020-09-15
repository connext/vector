import {
  ChannelSigner,
  getRandomChannelSigner,
  createTestChannelUpdateWithSigners,
  createVectorChannelMessage,
  createVectorErrorMessage,
  createTestChannelStateWithSigners,
  createTestLinkedTransferState,
  createCoreTransferState,
  hashCoreTransferState,
  hashLinkedTransferState,
  mkBytes32,
  delay,
} from "@connext/vector-utils";
import {
  IVectorStore,
  IMessagingService,
  FullChannelState,
  ChannelUpdateError,
  UpdateType,
  Result,
  VectorChannelMessage,
} from "@connext/vector-types";
import { constants } from "ethers";
import { expect } from "chai";
import { Evt } from "evt";

import { inbound, outbound } from "../sync";
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
  let store: IVectorStore;
  let messaging: IMessagingService;

  beforeEach(async () => {
    signers = Array(2).fill(0).map(() => getRandomChannelSigner(providerUrl));
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
    const update = createTestChannelUpdateWithSigners(signers, UpdateType.setup, {
      nonce: 1,
      signatures: [mkBytes32("0xsig1")],
    });
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { signatures, ...unsigned } = update;
    const message = createVectorChannelMessage({
      from: signers[0].publicIdentifier,
      to: signers[1].publicIdentifier,
      data: { update },
    });
    const [messageSent, res] = await Promise.all([
      // since we are returning an ack here (single signed update), wait
      // on messaging service
      new Promise<VectorChannelMessage>((res, rej) => {
        messaging.subscribe(signers[0].publicIdentifier, res);
        delay(5_000).then(rej);
      }),
      inbound(message, store, messaging, signers[1], chainProviders, stateEvt, errorEvt),
    ]);
    expect(res.isError).to.be.false;

    // Verify sent message
    expect(messageSent).to.be.ok;
    expect(messageSent.data.update.signatures.filter((x) => !!x).length).to.be.eq(2);
    expect(messageSent).to.containSubset({
      to: signers[0].publicIdentifier,
      from: signers[1].publicIdentifier,
      data: { update: unsigned, latestUpdate: res.getValue()!.latestUpdate },
    });
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
      stateEvt.waitFor((e) => e.nonce === update.nonce),
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
    expect(storedCommitment!.signatures.filter((x) => !!x).length).to.be.eq(2);
  });

  it("should update if stored state is in sync", async () => {
    // Load store with channel at nonce = 1
    const channel = createTestChannelStateWithSigners(signers, UpdateType.setup, { nonce: 1 });
    await store.saveChannelState(channel, {} as any);

    // Create the update to sync with (in this case, a deposit)
    const update = createTestChannelUpdateWithSigners(signers, UpdateType.deposit, {
      nonce: 2,
    });

    // Create the message
    const message = createVectorChannelMessage({
      from: signers[0].publicIdentifier,
      to: signers[1].publicIdentifier,
      data: { update, latestUpdate: channel.latestUpdate },
    });

    // Call `inbound`
    const [event, res] = await Promise.all([
      stateEvt.waitFor((e) => e.nonce === update.nonce),
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
    expect(storedCommitment!.signatures.filter((x) => !!x).length).to.be.eq(2);
  });
});

describe("outbound", () => {
  const chainProviders = config.chainProviders;
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [chainIdStr, providerUrl] = Object.entries(chainProviders)[0] as string[];
  const stateEvt = new Evt<FullChannelState>();
  const errorEvt = new Evt<ChannelUpdateError>();

  let signers: ChannelSigner[];
  let store: IVectorStore;
  let messaging: IMessagingService;

  beforeEach(async () => {
    signers = Array(2).fill(0).map(() => getRandomChannelSigner(providerUrl));
    store = new MemoryStoreService();
    messaging = new MemoryMessagingService();
  });

  it("should fail if it fails for some reason other than sync", async () => {
    const update = createTestChannelUpdateWithSigners(signers, UpdateType.deposit, { nonce: 2 });
    const channel = createTestChannelStateWithSigners(signers, UpdateType.setup, { nonce: 1 });
    await store.saveChannelState(channel, {} as any);

    const error = new ChannelUpdateError(ChannelUpdateError.reasons.TransferNotFound, update);

    const res = (await new Promise((resolve, reject) => {
      outbound(update, store, messaging, signers[0], chainProviders, stateEvt, errorEvt).then(resolve).catch(reject);

      // First post error. use timeout to allow listeners to register
      setTimeout(() => {
        errorEvt.post(error);
      }, 750);
    })) as Result<FullChannelState, ChannelUpdateError>;
    expect(res.isError).to.be.true;
    expect(res.getError()?.message).to.be.eq(error.message);
  });

  it("should update and retry if initiator is behind", async () => {
    // Initiator tries to deposit into channel, sees higher nonced state from
    // counterparty, updates and tries to deposit again
    const depositUpdate = createTestChannelUpdateWithSigners(signers, UpdateType.deposit, { nonce: 2 });
    const staleChannel = createTestChannelStateWithSigners(signers, UpdateType.setup, { nonce: 1 });
    const currentChannel = createTestChannelStateWithSigners(signers, UpdateType.deposit, {
      nonce: 2,
      latestUpdate: depositUpdate,
    });
    await store.saveChannelState(staleChannel, {} as any);

    // Send `outbound` call with deposit update and post to the error evt
    const res = (await new Promise((resolve, reject) => {
      outbound(depositUpdate, store, messaging, signers[0], chainProviders, stateEvt, errorEvt)
        .then(resolve)
        .catch(reject);

      // First post error. use timeout to allow listeners to register
      setTimeout(() => {
        errorEvt.post(
          new ChannelUpdateError(
            ChannelUpdateError.reasons.StaleUpdateNonce,
            currentChannel.latestUpdate,
            currentChannel,
          ),
        );
      }, 750);

      // Then, post state evt with proper state for updating
      setTimeout(() => stateEvt.post({ ...currentChannel, nonce: 3 }), 5000);
    })) as Result<FullChannelState, ChannelUpdateError>;
    expect(res.isError).to.be.false;

    const finalChannel = res.getValue();
    expect(finalChannel.nonce).to.be.eq(3);
    expect(finalChannel.latestUpdate.signatures.filter((x) => !!x).length).to.be.eq(2);
  });

  it("should successfully initiate update if channels are in sync (or initiator is ahead)", async () => {
    const update = createTestChannelUpdateWithSigners(signers, UpdateType.deposit, { nonce: 2 });
    const channel = createTestChannelStateWithSigners(signers, UpdateType.setup, { nonce: 1 });
    await store.saveChannelState(channel, {} as any);

    // Send `outbound` call with deposit update and post to the error evt
    const res = (await new Promise((resolve, reject) => {
      outbound(update, store, messaging, signers[0], chainProviders, stateEvt, errorEvt).then(resolve).catch(reject);

      // Then, post state evt with proper state for updating
      setTimeout(() => stateEvt.post({ ...channel, latestUpdate: update, nonce: 3 }), 5000);
    })) as Result<FullChannelState, ChannelUpdateError>;
    expect(res.isError).to.be.false;

    const finalChannel = res.getValue();
    expect(finalChannel.nonce).to.be.eq(3);
    expect(finalChannel.latestUpdate.signatures.filter((x) => !!x).length).to.be.eq(2);
  });
});
