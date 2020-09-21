import {
  ChannelSigner,
  getRandomChannelSigner,
  createTestChannelUpdateWithSigners,
  createTestChannelStateWithSigners,
  createTestLinkedTransferState,
  createCoreTransferState,
  hashCoreTransferState,
  hashTransferState,
  getRandomBytes32,
  createTestUpdateParams,
} from "@connext/vector-utils";
import {
  IVectorStore,
  IMessagingService,
  UpdateType,
  LinkedTransferStateEncoding,
  ChannelUpdate,
  InboundChannelUpdateError,
  LinkedTransferResolverEncoding,
  OutboundChannelUpdateError,
  Result,
} from "@connext/vector-types";
import { BigNumber, constants } from "ethers";
import { expect } from "chai";
import { MerkleTree } from "merkletreejs";
import pino from "pino";
import Sinon from "sinon";

import { applyUpdate } from "../update";
import { inbound, outbound } from "../sync";

import { MemoryStoreService } from "./services/store";
import { MemoryMessagingService } from "./services/messaging";
import { env } from "./utils";
import { MockOnchainService } from "./services/onchain";

describe("inbound", () => {
  const chainProviders = env.chainProviders;
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [chainIdStr, providerUrl] = Object.entries(chainProviders)[0] as string[];
  const inbox = getRandomBytes32();
  const logger = pino().child({
    testName: "inbound",
  });

  let signers: ChannelSigner[];
  let store: IVectorStore;
  let messaging: IMessagingService;

  beforeEach(async () => {
    signers = Array(2)
      .fill(0)
      .map(() => getRandomChannelSigner(providerUrl));
    store = new MemoryStoreService();
    messaging = new MemoryMessagingService();
  });

  it("should work if there is no channel state stored and you are receiving a setup update", async () => {
    // Generate the update
    const update: ChannelUpdate<typeof UpdateType.setup> = createTestChannelUpdateWithSigners(
      signers,
      UpdateType.setup,
      {
        nonce: 1,
        signatures: [],
      },
    );
    const result = await inbound(update, update, inbox, store, messaging, signers[1], logger);
    expect(result.getError()).to.be.undefined;

    // Verify result
    const emptyChannel = {
      channelAddress: update.channelAddress,
      participants: signers.map((s) => s.address),
      networkContext: update.details.networkContext,
      assetIds: [],
      balances: [],
      lockedBalance: [],
      merkleRoot: constants.HashZero,
      nonce: 0,
      publicIdentifiers: signers.map((s) => s.publicIdentifier),
      timeout: update.details.timeout,
      latestUpdate: {} as any, // There is no latest update on setup
      latestDepositNonce: 0,
    };
    const expected = (await applyUpdate(update, emptyChannel, undefined)).getValue()!;
    expect(result.getValue()).to.containSubset(expected);
  });

  it("should return an error if the update does not advance state", async () => {
    // Load store with channel at nonce = 1
    const channel = createTestChannelStateWithSigners(signers, UpdateType.setup, { nonce: 1 });
    await store.saveChannelState(channel, {} as any);

    // Generate an update at nonce = 1
    const update = createTestChannelUpdateWithSigners(signers, UpdateType.setup, { nonce: 1 });

    const result = await inbound(update, channel.latestUpdate, inbox, store, messaging, signers[1], logger);
    expect(result.isError).to.be.true;
    const error = result.getError()!;
    expect(error.message).to.be.eq(InboundChannelUpdateError.reasons.StaleUpdate);
    expect(error.update).to.containSubset(channel.latestUpdate);

    // Make sure store was not updated
    const stored = await store.getChannelState(channel.channelAddress);
    expect(stored).to.containSubset(channel);
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
    const coreState = createCoreTransferState({
      initialStateHash: hashTransferState(transferInitialState, LinkedTransferStateEncoding),
    });
    const hash = Buffer.from(hashCoreTransferState(coreState));
    const tree = new MerkleTree([hash], hashCoreTransferState);
    const update = createTestChannelUpdateWithSigners(signers, UpdateType.create, {
      nonce: 3,
      assetId,
      balance: transferInitialState.balance,
      details: {
        ...coreState,
        transferEncodings: [LinkedTransferStateEncoding, LinkedTransferResolverEncoding],
        transferInitialState,
        merkleRoot: tree.getHexRoot(),
        merkleProofData: tree.getHexProof(hash),
      },
    });

    // Call `inbound`
    const result = await inbound(update, toSync, inbox, store, messaging, signers[1], logger);
    expect(result.isError).to.be.false;

    // Verify stored data
    // TODO: stronger assertions!
    const storedState = await store.getChannelState(update.channelAddress);
    const storedCommitment = await store.getChannelCommitment(update.channelAddress);
    expect(storedState?.latestUpdate).to.containSubset(update);
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

    // Call `inbound`
    const result = await inbound(update, update, inbox, store, messaging, signers[1], logger);
    expect(result.isError).to.be.false;

    // Make sure whats in the store lines up with whats emitted
    const storedState = await store.getChannelState(update.channelAddress);
    const storedCommitment = await store.getChannelCommitment(update.channelAddress);

    // TODO: stronger assertions!
    // Verify stored data
    expect(storedState?.nonce).to.be.eq(update.nonce);
    expect(storedCommitment).to.be.ok;
    expect(storedCommitment!.signatures.filter((x) => !!x).length).to.be.eq(2);
  });
});

describe("outbound", () => {
  const chainProviders = env.chainProviders;
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [chainIdStr, providerUrl] = Object.entries(chainProviders)[0] as string[];
  const logger = pino().child({
    testName: "inbound",
  });

  let signers: ChannelSigner[];
  let store: IVectorStore;
  let messaging: Sinon.SinonStubbedInstance<MemoryMessagingService>;
  let chainService: MockOnchainService;

  beforeEach(async () => {
    signers = Array(2)
      .fill(0)
      .map(() => getRandomChannelSigner(providerUrl));
    store = new MemoryStoreService();
    messaging = Sinon.createStubInstance(MemoryMessagingService);
    chainService = new MockOnchainService();
  });

  it("should fail if it fails to generate the update", async () => {
    const params = createTestUpdateParams(UpdateType.deposit, {});

    const res = await outbound(params, store, chainService, messaging, signers[0], logger);
    expect(res.isError).to.be.true;
    expect(res.getError()?.message).to.be.eq(OutboundChannelUpdateError.reasons.ChannelNotFound);
  });

  it("should fail if it fails for some reason other than sync", async () => {
    const channel = createTestChannelStateWithSigners(signers, UpdateType.setup, { nonce: 1 });
    const params = createTestUpdateParams(UpdateType.deposit, { channelAddress: channel.channelAddress });
    chainService.setStub(
      "getLatestDepositByAssetId",
      Result.ok({
        nonce: BigNumber.from(channel.latestDepositNonce),
        amount: BigNumber.from(0),
      }),
    );
    const error = new InboundChannelUpdateError(InboundChannelUpdateError.reasons.RestoreNeeded, channel.latestUpdate);
    messaging.sendProtocolMessage.resolves(Result.fail(error));
    await store.saveChannelState(channel, {} as any);

    const res = await outbound(params, store, chainService, messaging, signers[0], logger);

    expect(res.isError).to.be.true;
    expect(res.getError()?.message).to.be.eq(OutboundChannelUpdateError.reasons.CounterpartyFailure);
  });

  // it("should update and retry if initiator is behind", async () => {
  //   // Initiator tries to deposit into channel, sees higher nonced state from
  //   // counterparty, updates and tries to deposit again
  //   const depositUpdate = createTestChannelUpdateWithSigners(signers, UpdateType.deposit, { nonce: 2 });
  //   const staleChannel = createTestChannelStateWithSigners(signers, UpdateType.setup, { nonce: 1 });
  //   const currentChannel = createTestChannelStateWithSigners(signers, UpdateType.deposit, {
  //     nonce: 2,
  //     latestUpdate: depositUpdate,
  //   });
  //   await store.saveChannelState(staleChannel, {} as any);

  //   // Send `outbound` call with deposit update and post to the error evt
  //   const res = (await new Promise((resolve, reject) => {
  //     outbound(depositUpdate, staleChannel, store, messaging, signers[0], stateEvt, errorEvt)
  //       .then(resolve)
  //       .catch(reject);

  //     // First post error. use timeout to allow listeners to register
  //     setTimeout(() => {
  //       errorEvt.post(
  //         new ChannelUpdateError(
  //           ChannelUpdateError.reasons.StaleUpdateNonce,
  //           currentChannel.latestUpdate,
  //           currentChannel,
  //         ),
  //       );
  //     }, 750);

  //     // Then, post state evt with proper state for updating
  //     setTimeout(() => stateEvt.post({ ...currentChannel, nonce: 3 }), 5000);
  //   })) as Result<FullChannelState, ChannelUpdateError>;
  //   expect(res.isError).to.be.false;

  //   const finalChannel = res.getValue();
  //   expect(finalChannel.nonce).to.be.eq(3);
  //   expect(finalChannel.latestUpdate.signatures.filter((x) => !!x).length).to.be.eq(2);
  // });

  // it("should successfully initiate update if channels are in sync (or initiator is ahead)", async () => {
  //   const channel = createTestChannelStateWithSigners(signers, UpdateType.setup, { nonce: 1 });
  //   const params = createTestUpdateParams(UpdateType.deposit, {
  //     channelAddress: channel.channelAddress,
  //     details: { channelAddress: channel.channelAddress },
  //   });
  //   await store.saveChannelState(channel, {} as any);

  //   // Set messaging stub
  //   messaging.sendProtocolMessage.resolves(Result.ok({
  //     update: ,
  //     previousUpdate: channel.latestUpdate
  //   }))

  //   // Send `outbound` call with deposit update and post to the error evt
  //   const res = await outbound(params, store, chainService, messaging, signers[0], logger);
  //   expect(res.getError()).to.be.undefined;

  //   const res = (await new Promise((resolve, reject) => {
  //     outbound(update, channel, store, messaging, signers[0], stateEvt, errorEvt).then(resolve).catch(reject);

  //     // Then, post state evt with proper state for updating
  //     setTimeout(() => stateEvt.post({ ...channel, latestUpdate: update, nonce: 3 }), 5000);
  //   })) as Result<FullChannelState, ChannelUpdateError>;
  //   expect(res.isError).to.be.false;

  //   const finalChannel = res.getValue();
  //   expect(finalChannel.nonce).to.be.eq(3);
  //   expect(finalChannel.latestUpdate.signatures.filter((x) => !!x).length).to.be.eq(2);
  // });
});
