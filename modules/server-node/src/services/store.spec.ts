import {
  Balance,
  EngineEvent,
  EngineEvents,
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
  mkAddress,
  mkPublicIdentifier,
} from "@connext/vector-utils";
import { constants } from "ethers";

import { config } from "../config";

import { PrismaStore } from "./store";

describe("store", () => {
  let store: PrismaStore;

  before(() => {
    store = new PrismaStore(config.dbUrl);
  });

  beforeEach(async () => {
    await store.clear();
  });

  after(async () => {
    await store.disconnect();
  });

  it("should save transaction responses and receipts", async () => {
    // Load store with channel
    const setupState = createTestChannelState("setup");
    await store.saveChannelState(setupState, {
      channelFactoryAddress: setupState.networkContext.channelFactoryAddress,
      chainId: setupState.networkContext.chainId,
      aliceSignature: setupState.latestUpdate.aliceSignature,
      bobSignature: setupState.latestUpdate.bobSignature,
      state: setupState,
    });

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
    const setupState = createTestChannelState("setup");
    await store.saveChannelState(setupState, {
      channelFactoryAddress: setupState.networkContext.channelFactoryAddress,
      chainId: setupState.networkContext.chainId,
      aliceSignature: setupState.latestUpdate.aliceSignature,
      bobSignature: setupState.latestUpdate.bobSignature,
      state: setupState,
    });

    let fromStore = await store.getChannelState(setupState.channelAddress);
    expect(fromStore).to.deep.eq(setupState);

    const updatedBalanceForDeposit: Balance = { amount: ["10", "20"], to: setupState.balances[0].to };
    const depositState = createTestChannelState("deposit", {
      nonce: setupState.nonce + 1,
      defundNonce: setupState.defundNonce,
      balances: [updatedBalanceForDeposit, setupState.balances[0]],
    });
    await store.saveChannelState(depositState, {
      channelFactoryAddress: depositState.networkContext.channelFactoryAddress,
      chainId: depositState.networkContext.chainId,
      aliceSignature: depositState.latestUpdate.aliceSignature,
      bobSignature: depositState.latestUpdate.bobSignature,
      state: depositState,
    });

    fromStore = await store.getChannelState(setupState.channelAddress);
    expect(fromStore).to.deep.eq(depositState);

    const transfer = createTestFullHashlockTransferState({
      transferId: mkHash("0x111"),
      meta: { routingId: mkBytes32("0xddd") },
      chainId: depositState.networkContext.chainId,
    });
    const createState = createTestChannelState("create", {
      channelAddress: transfer.channelAddress,
      networkContext: { channelFactoryAddress: transfer.channelFactoryAddress, chainId: transfer.chainId },
      nonce: depositState.nonce + 1,
      defundNonce: setupState.defundNonce,
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
    });
    await store.saveChannelState(
      createState,
      {
        channelFactoryAddress: createState.networkContext.channelFactoryAddress,
        chainId: createState.networkContext.chainId,
        aliceSignature: createState.latestUpdate.aliceSignature,
        bobSignature: createState.latestUpdate.bobSignature,
        state: createState,
      },
      transfer,
    );

    fromStore = await store.getChannelState(setupState.channelAddress);
    expect(fromStore).to.deep.eq(createState);

    const resolveState = createTestChannelState("resolve", {
      nonce: createState.nonce + 1,
      defundNonce: setupState.defundNonce,
      latestUpdate: {
        nonce: createState.nonce + 1,
        details: {
          transferId: transfer.transferId,
        },
      },
    });
    await store.saveChannelState(resolveState, {
      channelFactoryAddress: resolveState.networkContext.channelFactoryAddress,
      chainId: resolveState.networkContext.chainId,
      aliceSignature: resolveState.latestUpdate.aliceSignature,
      bobSignature: resolveState.latestUpdate.bobSignature,
      state: resolveState,
    });

    fromStore = await store.getChannelState(setupState.channelAddress);
    expect(fromStore).to.deep.eq(resolveState);
  });

  it("should update transfer resolver", async () => {
    const transferId = mkBytes32("0xabcde");
    const alice = mkPublicIdentifier("indraA");
    const bob = mkPublicIdentifier("indraB");
    const meta = { hello: "world" };
    const createState = createTestChannelState("create", {
      aliceIdentifier: alice,
      bobIdentifier: bob,
      latestUpdate: { details: { transferId, meta }, fromIdentifier: alice, toIdentifier: bob },
    });
    const transfer: FullTransferState = createTestFullHashlockTransferState({
      transferId,
      preImage: constants.HashZero,
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
    await store.saveChannelState(
      createState,
      {
        channelFactoryAddress: createState.networkContext.channelFactoryAddress,
        chainId: createState.networkContext.chainId,
        aliceSignature: createState.latestUpdate.aliceSignature,
        bobSignature: createState.latestUpdate.bobSignature,
        state: createState,
      },
      transfer,
    );
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
    (resolveState.defundNonce = (Number(createState.defundNonce) + 1).toString()),
      (resolveState.latestUpdate.nonce = createState.latestUpdate.nonce + 1);

    await store.saveChannelState(resolveState, {
      channelFactoryAddress: resolveState.networkContext.channelFactoryAddress,
      chainId: resolveState.networkContext.chainId,
      aliceSignature: resolveState.latestUpdate.aliceSignature,
      bobSignature: resolveState.latestUpdate.bobSignature,
      state: resolveState,
    });
    const fromStore = await store.getChannelState(resolveState.channelAddress);
    expect(fromStore).to.deep.eq(resolveState);

    transferFromStore = await store.getTransferState(transfer.transferId);
    expect(transferFromStore.transferResolver).to.deep.eq(
      (resolveState.latestUpdate.details as ResolveUpdateDetails).transferResolver,
    );
  });

  it("should create multiple active transfers", async () => {
    const transfer1 = createTestFullHashlockTransferState({
      transferId: mkHash("0x111"),
      meta: { routingId: mkBytes32("0xddd") },
      balance: { to: [mkAddress("0xaaa"), mkAddress("0xbbb")], amount: ["5", "0"] },
    });
    const createState = createTestChannelState("create", {
      channelAddress: transfer1.channelAddress,
      networkContext: { channelFactoryAddress: transfer1.channelFactoryAddress, chainId: transfer1.chainId },
      latestUpdate: {
        details: {
          balance: transfer1.balance,
          transferInitialState: transfer1.transferState,
          transferId: transfer1.transferId,
          meta: transfer1.meta,
          transferDefinition: transfer1.transferDefinition,
          transferEncodings: transfer1.transferEncodings,
          transferTimeout: transfer1.transferTimeout,
        },
      },
    });

    transfer1.transferResolver = undefined;

    await store.saveChannelState(
      createState,
      {
        channelFactoryAddress: createState.networkContext.channelFactoryAddress,
        chainId: createState.networkContext.chainId,
        aliceSignature: createState.latestUpdate.aliceSignature,
        bobSignature: createState.latestUpdate.bobSignature,
        state: createState,
      },
      transfer1,
    );

    const transfer2 = createTestFullHashlockTransferState({
      channelAddress: createState.channelAddress,
      meta: { routingId: mkBytes32("0xeee") },
      balance: { to: [mkAddress("0xaaa"), mkAddress("0xbbb")], amount: ["5", "0"] },
    });
    transfer2.transferResolver = undefined;

    const updatedState = createTestChannelState("create", {
      channelAddress: transfer2.channelAddress,
      networkContext: { channelFactoryAddress: transfer2.channelFactoryAddress, chainId: transfer2.chainId },
      latestUpdate: {
        details: {
          balance: transfer2.balance,
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
      defundNonce: createState.defundNonce,
    });

    await store.saveChannelState(
      updatedState,
      {
        channelFactoryAddress: createState.networkContext.channelFactoryAddress,
        chainId: createState.networkContext.chainId,
        aliceSignature: createState.latestUpdate.aliceSignature,
        bobSignature: createState.latestUpdate.bobSignature,
        state: updatedState,
      },
      transfer2,
    );

    const channelFromStore = await store.getChannelState(createState.channelAddress);
    expect(channelFromStore).to.deep.eq(updatedState);

    const transfers = await store.getActiveTransfers(createState.channelAddress);

    expect(transfers.length).eq(2);
    const t1 = transfers.find(t => t.transferId === transfer1.transferId);
    const t2 = transfers.find(t => t.transferId === transfer2.transferId);
    expect(t1).to.deep.eq(transfer1);
    expect(t2).to.deep.eq(transfer2);
  });

  it("should create an event subscription", async () => {
    const pubId = mkPublicIdentifier();
    const subs = {
      [EngineEvents.CONDITIONAL_TRANSFER_CREATED]: "sub1",
      [EngineEvents.CONDITIONAL_TRANSFER_RESOLVED]: "sub2",
      [EngineEvents.DEPOSIT_RECONCILED]: "sub3",
    };
    await store.registerSubscription(pubId, EngineEvents.CONDITIONAL_TRANSFER_CREATED, "othersub");

    const other = await store.getSubscription(pubId, EngineEvents.CONDITIONAL_TRANSFER_CREATED);
    expect(other).to.eq("othersub");

    for (const [event, url] of Object.entries(subs)) {
      await store.registerSubscription(pubId, event as EngineEvent, url);
    }

    const all = await store.getSubscriptions(pubId);
    expect(all).to.deep.eq(subs);
  });

  it("should get multiple transfers by routingId", async () => {
    const routingId = mkBytes32("0xddd");
    const alice = getRandomIdentifier();
    const bob1 = getRandomIdentifier();
    const transfer1 = createTestFullHashlockTransferState({
      transferId: mkHash("0x111"),
      meta: { routingId },
      balance: {
        to: [getSignerAddressFromPublicIdentifier(alice), getSignerAddressFromPublicIdentifier(bob1)],
        amount: ["7", "0"],
      },
      responder: getSignerAddressFromPublicIdentifier(alice),
      initiator: getSignerAddressFromPublicIdentifier(bob1),
    });
    const createState = createTestChannelState("create", {
      aliceIdentifier: alice,
      alice: getSignerAddressFromPublicIdentifier(alice),
      bobIdentifier: bob1,
      bob: getSignerAddressFromPublicIdentifier(bob1),
      channelAddress: transfer1.channelAddress,
      networkContext: { channelFactoryAddress: transfer1.channelFactoryAddress, chainId: transfer1.chainId },
      latestUpdate: {
        fromIdentifier: bob1,
        toIdentifier: alice,
        details: {
          balance: transfer1.balance,
          transferInitialState: transfer1.transferState,
          transferId: transfer1.transferId,
          meta: transfer1.meta,
          transferDefinition: transfer1.transferDefinition,
          transferEncodings: transfer1.transferEncodings,
          transferTimeout: transfer1.transferTimeout,
        },
      },
    });

    transfer1.transferResolver = undefined;

    await store.saveChannelState(
      createState,
      {
        channelFactoryAddress: createState.networkContext.channelFactoryAddress,
        chainId: createState.networkContext.chainId,
        aliceSignature: createState.latestUpdate.aliceSignature,
        bobSignature: createState.latestUpdate.bobSignature,
        state: createState,
      },
      transfer1,
    );

    const newBob = getRandomIdentifier();
    const transfer2 = createTestFullHashlockTransferState({
      transferId: mkHash("0x122"),
      meta: { routingId },
      balance: {
        to: [getSignerAddressFromPublicIdentifier(alice), getSignerAddressFromPublicIdentifier(newBob)],
        amount: ["7", "0"],
      },
      channelAddress: getRandomBytes32(),
      initiator: getSignerAddressFromPublicIdentifier(alice),
      responder: getSignerAddressFromPublicIdentifier(newBob),
    });
    transfer2.transferResolver = undefined;
    const createState2 = createTestChannelState("create", {
      aliceIdentifier: alice,
      alice: getSignerAddressFromPublicIdentifier(alice),
      channelAddress: transfer2.channelAddress,
      bob: getSignerAddressFromPublicIdentifier(newBob),
      bobIdentifier: newBob,
      networkContext: { channelFactoryAddress: transfer2.channelFactoryAddress, chainId: transfer2.chainId },
      latestUpdate: {
        fromIdentifier: alice,
        toIdentifier: newBob,
        details: {
          balance: transfer2.balance,
          transferInitialState: transfer2.transferState,
          transferId: transfer2.transferId,
          meta: transfer2.meta,
          transferDefinition: transfer2.transferDefinition,
          transferEncodings: transfer2.transferEncodings,
          transferTimeout: transfer2.transferTimeout,
        },
      },
    });

    await store.saveChannelState(
      createState2,
      {
        channelFactoryAddress: createState2.networkContext.channelFactoryAddress,
        chainId: createState2.networkContext.chainId,
        aliceSignature: createState2.latestUpdate.aliceSignature,
        bobSignature: createState2.latestUpdate.bobSignature,
        state: createState2,
      },
      transfer2,
    );

    const transfers = await store.getTransfersByRoutingId(routingId);
    expect(transfers.length).to.eq(2);

    const t1 = transfers.find(t => t.transferId === transfer1.transferId);
    const t2 = transfers.find(t => t.transferId === transfer2.transferId);
    expect(t1).to.deep.eq(transfer1);
    expect(t2).to.deep.eq(transfer2);
  });
});
