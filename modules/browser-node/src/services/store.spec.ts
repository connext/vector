import {
  Balance,
  FullChannelState,
  FullTransferState,
  ResolveUpdateDetails,
  StoredTransactionStatus,
  TransactionReason,
  UpdateType,
} from "@connext/vector-types";
import {
  createTestFullHashlockTransferState,
  createTestChannelState,
  mkBytes32,
  mkHash,
  expect,
  getRandomBytes32,
  getRandomIdentifier,
  getSignerAddressFromPublicIdentifier,
  createTestTxResponse,
  mkPublicIdentifier,
  mkAddress,
} from "@connext/vector-utils";
import { HashZero } from "@ethersproject/constants";
import indexedDB from "fake-indexeddb";
import IDBKeyRange from "fake-indexeddb/lib/FDBKeyRange";
import pino from "pino";

import { BrowserStore } from "./store";
const logger = pino();
describe("store", () => {
  let store: BrowserStore;

  before(async () => {
    store = new BrowserStore(logger.child({ module: "BrowserStore" }), indexedDB, IDBKeyRange);
    await store.connect();
  });

  beforeEach(async () => {
    await store.clear();
  });

  after(async () => {
    await store.disconnect();
  });

  describe("getActiveTransfers", () => {
    it("should get active transfers for different channels", async () => {
      const channel1 = mkAddress("0xaaa");
      const transfer1State = createTestChannelState(
        "create",
        {
          channelAddress: channel1,
        },
        { transferId: mkHash("0x123"), meta: { routingId: mkHash("0x123") } },
      );
      await store.saveChannelState(transfer1State.channel, transfer1State.transfer);

      const transfer2State = createTestChannelState(
        "create",
        {
          channelAddress: channel1,
          nonce: transfer1State.channel.nonce + 1,
        },
        { transferId: mkHash("0x456"), meta: { routingId: mkHash("0x456") } },
      );
      await store.saveChannelState(transfer2State.channel, transfer2State.transfer);

      const channel2 = mkAddress("0xbbb");
      const transfer3State = createTestChannelState(
        "create",
        {
          channelAddress: channel2,
          bob: mkAddress("0xbaba"),
          bobIdentifier: mkPublicIdentifier("vectorABCD"),
        },
        { transferId: mkHash("0x789"), meta: { routingId: mkHash("0x789") } },
      );
      await store.saveChannelState(transfer3State.channel, transfer3State.transfer);

      const channelFromStore = await store.getChannelState(transfer1State.channel.channelAddress);
      expect(channelFromStore).to.deep.eq(transfer2State.channel);

      const transfersChannel1 = await store.getActiveTransfers(transfer1State.channel.channelAddress);
      expect(transfersChannel1.length).eq(2);
      const t1 = transfersChannel1.find((t) => t.transferId === transfer1State.transfer.transferId);
      const t2 = transfersChannel1.find((t) => t.transferId === transfer2State.transfer.transferId);
      expect(t1).to.deep.eq(transfer1State.transfer);
      expect(t2).to.deep.eq(transfer2State.transfer);

      const transfersChannel2 = await store.getActiveTransfers(transfer3State.channel.channelAddress);
      const t3 = transfersChannel2.find((t) => t.transferId === transfer3State.transfer.transferId);
      expect(t3).to.deep.eq(transfer3State.transfer);
    });

    it("should consider resolved transfers", async () => {
      const channel1 = mkAddress("0xaaa");
      const transfer1State = createTestChannelState(
        "create",
        {
          channelAddress: channel1,
        },
        { transferId: mkHash("0x123"), meta: { routingId: mkHash("0x123") } },
      );
      await store.saveChannelState(transfer1State.channel, transfer1State.transfer);

      const transfer2Create = createTestChannelState(
        "create",
        {
          channelAddress: channel1,
          nonce: transfer1State.channel.nonce + 1,
        },
        { transferId: mkHash("0x456"), meta: { routingId: mkHash("0x456") } },
      );
      await store.saveChannelState(transfer2Create.channel, transfer2Create.transfer);

      const transfer2Resolve = createTestChannelState(
        "resolve",
        {
          channelAddress: channel1,
          nonce: transfer2Create.channel.nonce + 1,
        },
        { transferId: mkHash("0x456"), meta: { routingId: mkHash("0x456") } },
      );
      await store.saveChannelState(transfer2Resolve.channel, transfer2Resolve.transfer);

      const channel2 = mkAddress("0xbbb");
      const transfer3State = createTestChannelState(
        "create",
        {
          channelAddress: channel2,
          bob: mkAddress("0xbaba"),
          bobIdentifier: mkPublicIdentifier("vectorABCD"),
        },
        { transferId: mkHash("0x789"), meta: { routingId: mkHash("0x789") } },
      );
      await store.saveChannelState(transfer3State.channel, transfer3State.transfer);

      const channelFromStore = await store.getChannelState(transfer1State.channel.channelAddress);
      expect(channelFromStore).to.deep.eq(transfer2Resolve.channel);

      const transfersChannel1 = await store.getActiveTransfers(transfer1State.channel.channelAddress);
      expect(transfersChannel1.length).eq(1);
      const t1 = transfersChannel1.find((t) => t.transferId === transfer1State.transfer.transferId);
      expect(t1).to.deep.eq(transfer1State.transfer);

      const transfersChannel2 = await store.getActiveTransfers(transfer3State.channel.channelAddress);
      const t3 = transfersChannel2.find((t) => t.transferId === transfer3State.transfer.transferId);
      expect(t3).to.deep.eq(transfer3State.transfer);
    });
  });

  describe("getChannelStateByParticipants", () => {
    it("should work (regardless of order)", async () => {
      const channel = createTestChannelState("deposit").channel;
      await store.saveChannelState(channel);

      expect(
        await store.getChannelStateByParticipants(channel.alice, channel.bob, channel.networkContext.chainId),
      ).to.be.deep.eq(channel);

      expect(
        await store.getChannelStateByParticipants(channel.bob, channel.alice, channel.networkContext.chainId),
      ).to.be.deep.eq(channel);
    });
  });

  describe("getTransferByRoutingId", () => {
    it("should work", async () => {
      const state = createTestChannelState("create", {}, { meta: { routingId: getRandomBytes32() } });
      await store.saveChannelState(state.channel, state.transfer);

      expect(
        await store.getTransferByRoutingId(state.channel.channelAddress, state.transfer.meta!.routingId),
      ).to.be.deep.eq(state.transfer);
    });
  });

  describe("getChannelStates", () => {
    it("should return all channel states", async () => {
      const c1 = createTestChannelState("deposit", { channelAddress: mkAddress("0xccc1111") }).channel;
      const c2 = createTestChannelState("deposit", { channelAddress: mkAddress("0xccc2222") }).channel;
      await Promise.all(
        [c1, c2].map((c) => {
          return store.saveChannelState(c);
        }),
      );
      const retrieved = await store.getChannelStates();
      expect(retrieved.sort()).to.be.deep.eq([c1, c2].sort());
      expect(retrieved.length).to.be.eq(2);
    });
  });

  it("should save transaction responses and receipts", async () => {
    // Load store with channel
    const setupState = createTestChannelState("setup").channel;
    await store.saveChannelState(setupState);

    const response = createTestTxResponse();

    // save response
    await store.saveTransactionResponse(setupState.channelAddress, TransactionReason.depositA, response);

    // verify response
    const storedResponse = await store.getTransactionByHash(response.hash);
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { wait, confirmations, hash, ...sanitizedResponse } = response;
    expect(storedResponse).to.containSubset({
      ...sanitizedResponse,
      status: StoredTransactionStatus.submitted,
      channelAddress: setupState.channelAddress,
      transactionHash: hash,
      gasLimit: response.gasLimit.toString(),
      gasPrice: response.gasPrice.toString(),
      value: response.value.toString(),
    });

    // save receipt
    const receipt = await response.wait();
    await store.saveTransactionReceipt(setupState.channelAddress, receipt);

    // verify receipt
    const storedReceipt = await store.getTransactionByHash(response.hash);
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { confirmations: receiptConfs, ...sanitizedReceipt } = receipt;
    expect(storedReceipt).to.containSubset({
      ...sanitizedResponse,
      ...sanitizedReceipt,
      channelAddress: setupState.channelAddress,
      transactionHash: hash,
      gasLimit: response.gasLimit.toString(),
      gasPrice: response.gasPrice.toString(),
      value: response.value.toString(),
      cumulativeGasUsed: receipt.cumulativeGasUsed.toString(),
      gasUsed: receipt.gasUsed.toString(),
      status: StoredTransactionStatus.mined,
    });

    // save failing response
    const failed = createTestTxResponse({ hash: mkHash("0x13754"), nonce: 65 });
    await store.saveTransactionResponse(setupState.channelAddress, TransactionReason.depositB, failed);
    // save error
    await store.saveTransactionFailure(setupState.channelAddress, failed.hash, "failed to send");
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { wait: fWait, confirmations: fConf, hash: fHash, ...sanitizedFailure } = failed;
    const storedFailure = await store.getTransactionByHash(fHash);
    expect(storedFailure).to.containSubset({
      ...sanitizedFailure,
      transactionHash: fHash,
      gasLimit: failed.gasLimit.toString(),
      gasPrice: failed.gasPrice.toString(),
      value: failed.value.toString(),
      status: StoredTransactionStatus.failed,
      error: "failed to send",
    });
  });

  it("should save and retrieve all update types and keep updating the channel", async () => {
    const setupState = createTestChannelState("setup").channel;
    await store.saveChannelState(setupState);

    let fromStore = await store.getChannelState(setupState.channelAddress);
    expect(fromStore).to.deep.eq(setupState);

    const updatedBalanceForDeposit: Balance = { amount: ["10", "20"], to: setupState.balances[0].to };
    const depositState = createTestChannelState("deposit", {
      nonce: setupState.nonce + 1,
      defundNonces: setupState.defundNonces,
      balances: [updatedBalanceForDeposit, setupState.balances[0]],
      networkContext: setupState.networkContext,
    }).channel;
    await store.saveChannelState(depositState);

    fromStore = await store.getChannelState(setupState.channelAddress);
    expect(fromStore).to.deep.eq(depositState);

    const transfer = createTestFullHashlockTransferState({
      transferId: mkHash("0x111"),
      meta: { routingId: mkBytes32("0xddd") },
      chainId: depositState.networkContext.chainId,
    });
    const createState = createTestChannelState("create", {
      channelAddress: transfer.channelAddress,
      networkContext: {
        channelFactoryAddress: transfer.channelFactoryAddress,
        chainId: transfer.chainId,
        transferRegistryAddress: setupState.networkContext.transferRegistryAddress,
      },
      nonce: depositState.nonce + 1,
      defundNonces: setupState.defundNonces,
      latestUpdate: {
        details: {
          balance: transfer.balance,
          transferInitialState: transfer.transferState,
          transferId: transfer.transferId,
          meta: transfer.meta,
          transferDefinition: transfer.transferDefinition,
          transferEncodings: transfer.transferEncodings,
          transferTimeout: transfer.transferTimeout,
        },
        nonce: depositState.nonce + 1,
      },
    }).channel;
    await store.saveChannelState(createState, transfer);

    fromStore = await store.getChannelState(setupState.channelAddress);
    expect(fromStore).to.deep.eq(createState);

    const resolveState = createTestChannelState("resolve", {
      nonce: createState.nonce + 1,
      defundNonces: setupState.defundNonces,
      networkContext: setupState.networkContext,
      latestUpdate: {
        nonce: createState.nonce + 1,
        details: {
          transferId: transfer.transferId,
        },
      },
    }).channel;
    await store.saveChannelState(resolveState);

    fromStore = await store.getChannelState(setupState.channelAddress);
    expect(fromStore).to.deep.eq(resolveState);
  });

  it("should update transfer resolver", async () => {
    const transferId = mkBytes32("0xabcde");
    const alice = mkPublicIdentifier("vectorA");
    const bob = mkPublicIdentifier("vectorB");
    const meta = { hello: "world" };
    const createState = createTestChannelState("create", {
      aliceIdentifier: alice,
      bobIdentifier: bob,
      latestUpdate: { details: { transferId, meta }, fromIdentifier: alice, toIdentifier: bob },
    }).channel;
    const transfer: FullTransferState = createTestFullHashlockTransferState({
      transferId,
      preImage: HashZero,
      channelAddress: createState.channelAddress,
      channelFactoryAddress: createState.networkContext.channelFactoryAddress,
      chainId: createState.networkContext.chainId,
      initiator: createState.alice,
      responder: createState.bob,
      meta,
      transferEncodings: createState.latestUpdate.details.transferEncodings,
      transferResolver: undefined,
      transferTimeout: createState.latestUpdate.details.transferTimeout,
      transferState: createState.latestUpdate.details.transferInitialState,
    });
    await store.saveChannelState(createState, transfer);
    let transferFromStore = await store.getTransferState(transfer.transferId);
    expect(transferFromStore).to.deep.eq(transfer);

    const resolveState: FullChannelState = createState;
    resolveState.latestUpdate.details = {
      transferId,
      transferDefinition: transfer.transferDefinition,
      transferResolver: { preImage: mkBytes32("0xaabbcc") },
      merkleRoot: mkHash("0xbbbeee"),
    } as ResolveUpdateDetails;
    resolveState.latestUpdate.details.transferResolver = { preImage: mkBytes32("0xaabbcc") };
    resolveState.latestUpdate.type = UpdateType.resolve;
    resolveState.nonce = createState.nonce + 1;
    resolveState.latestUpdate.nonce = createState.latestUpdate.nonce + 1;

    await store.saveChannelState(resolveState);
    const fromStore = await store.getChannelState(resolveState.channelAddress);
    expect(fromStore).to.deep.eq(resolveState);

    transferFromStore = await store.getTransferState(transfer.transferId);
    expect(transferFromStore?.transferResolver).to.deep.eq(
      (resolveState.latestUpdate.details as ResolveUpdateDetails).transferResolver,
    );
  });

  it("should create multiple active transfers", async () => {
    const transfer1 = createTestFullHashlockTransferState({
      transferId: mkHash("0x111"),
      meta: { routingId: mkBytes32("0xddd") },
    });
    const createState = createTestChannelState("create", {
      channelAddress: transfer1.channelAddress,
      networkContext: {
        channelFactoryAddress: transfer1.channelFactoryAddress,
        chainId: transfer1.chainId,
      },
      latestUpdate: {
        details: {
          transferInitialState: transfer1.transferState,
          transferId: transfer1.transferId,
          meta: transfer1.meta,
          transferDefinition: transfer1.transferDefinition,
          transferEncodings: transfer1.transferEncodings,
          transferTimeout: transfer1.transferTimeout,
        },
      },
    }).channel;

    transfer1.transferResolver = undefined;

    await store.saveChannelState(createState, transfer1);

    const transfer2 = createTestFullHashlockTransferState({
      channelAddress: createState.channelAddress,
      meta: { routingId: mkBytes32("0xeee") },
    });
    transfer2.transferResolver = undefined;

    const updatedState = createTestChannelState("create", {
      channelAddress: transfer2.channelAddress,
      networkContext: { channelFactoryAddress: transfer2.channelFactoryAddress, chainId: transfer2.chainId },
      latestUpdate: {
        details: {
          transferInitialState: transfer2.transferState,
          transferId: transfer2.transferId,
          meta: transfer2.meta,
          transferDefinition: transfer2.transferDefinition,
          transferEncodings: transfer2.transferEncodings,
          transferTimeout: transfer2.transferTimeout,
        },
        nonce: createState.latestUpdate.nonce + 1,
      },
      nonce: createState.latestUpdate.nonce + 1,
    }).channel;

    await store.saveChannelState(updatedState, transfer2);

    const channelFromStore = await store.getChannelState(createState.channelAddress);
    expect(channelFromStore).to.deep.eq(updatedState);

    const transfers = await store.getActiveTransfers(createState.channelAddress);

    expect(transfers.length).eq(2);
    const t1 = transfers.find((t) => t.transferId === transfer1.transferId);
    const t2 = transfers.find((t) => t.transferId === transfer2.transferId);
    expect(t1).to.deep.eq(transfer1);
    expect(t2).to.deep.eq(transfer2);
  });

  it("should get multiple transfers by routingId", async () => {
    const transfer1 = createTestFullHashlockTransferState({
      transferId: mkHash("0x111"),
      meta: { routingId: mkBytes32("0xddd") },
    });
    const createState = createTestChannelState("create", {
      channelAddress: transfer1.channelAddress,
      networkContext: { channelFactoryAddress: transfer1.channelFactoryAddress, chainId: transfer1.chainId },
      latestUpdate: {
        details: {
          transferInitialState: transfer1.transferState,
          transferId: transfer1.transferId,
          meta: transfer1.meta,
          transferDefinition: transfer1.transferDefinition,
          transferEncodings: transfer1.transferEncodings,
          transferTimeout: transfer1.transferTimeout,
        },
      },
    }).channel;

    transfer1.transferResolver = undefined;

    await store.saveChannelState(createState, transfer1);

    const newBob = getRandomIdentifier();
    const transfer2 = createTestFullHashlockTransferState({
      transferId: mkHash("0x122"),
      meta: { routingId: mkBytes32("0xddd") },
      channelAddress: getRandomBytes32(),
      responder: getSignerAddressFromPublicIdentifier(newBob),
    });
    transfer2.transferResolver = undefined;
    const createState2 = createTestChannelState("create", {
      channelAddress: transfer2.channelAddress,
      bob: getSignerAddressFromPublicIdentifier(newBob),
      bobIdentifier: newBob,
      networkContext: { channelFactoryAddress: transfer2.channelFactoryAddress, chainId: transfer2.chainId },
      latestUpdate: {
        details: {
          transferInitialState: transfer2.transferState,
          transferId: transfer2.transferId,
          meta: transfer2.meta,
          transferDefinition: transfer2.transferDefinition,
          transferEncodings: transfer2.transferEncodings,
          transferTimeout: transfer2.transferTimeout,
        },
      },
    }).channel;

    await store.saveChannelState(createState2, transfer2);

    const transfers = await store.getTransfersByRoutingId(transfer2.meta.routingId);
    expect(transfers.length).to.eq(2);

    const t1 = transfers.find((t) => t.transferId === transfer1.transferId);
    const t2 = transfers.find((t) => t.transferId === transfer2.transferId);
    expect(t1).to.deep.eq(transfer1);
    expect(t2).to.deep.eq(transfer2);
  });
});
