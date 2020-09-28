import { Balance } from "@connext/vector-types";
import { createTestFullLinkedTransferState, createTestChannelState, mkBytes32, mkHash } from "@connext/vector-utils";

import { expect } from "../test/utils/assert";
import { config } from "../config";

import { PrismaStore } from "./store";

describe("store", () => {
  let store: PrismaStore;

  before(() => {
    store = new PrismaStore(config.dbUrl);
  });

  beforeEach(async () => {
    await store.prisma.balance.deleteMany({});
    await store.prisma.channel.deleteMany({});
    await store.prisma.update.deleteMany({});
    await store.prisma.transfer.deleteMany({});
  });

  after(async () => {
    await store.disconnect();
  });

  it("should save and retrieve all update types and keep updating the channel", async () => {
    const setupState = createTestChannelState("setup");
    await store.saveChannelState(setupState, {
      channelFactoryAddress: setupState.networkContext.channelFactoryAddress,
      chainId: setupState.networkContext.chainId,
      signatures: setupState.latestUpdate.signatures,
      state: setupState,
    });

    let fromStore = await store.getChannelState(setupState.channelAddress);
    expect(fromStore).to.deep.eq(setupState);

    const updatedBalanceForDeposit: Balance = { amount: ["10", "20"], to: setupState.balances[0].to };
    const depositState = createTestChannelState("deposit", {
      nonce: setupState.nonce + 1,
      balances: [updatedBalanceForDeposit, setupState.balances[0]],
    });
    await store.saveChannelState(depositState, {
      channelFactoryAddress: depositState.networkContext.channelFactoryAddress,
      chainId: depositState.networkContext.chainId,
      signatures: depositState.latestUpdate.signatures,
      state: depositState,
    });

    fromStore = await store.getChannelState(setupState.channelAddress);
    expect(fromStore).to.deep.eq(depositState);

    const transfer = createTestFullLinkedTransferState({
      transferId: mkHash("0x111"),
      meta: { routingId: mkBytes32("0xddd") },
      chainId: depositState.networkContext.chainId,
    });
    const createState = createTestChannelState("create", {
      channelAddress: transfer.channelAddress,
      networkContext: { channelFactoryAddress: transfer.channelFactoryAddress, chainId: transfer.chainId },
      nonce: depositState.nonce + 1,
      latestUpdate: {
        details: {
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
        signatures: createState.latestUpdate.signatures,
        state: createState,
      },
      transfer,
    );

    fromStore = await store.getChannelState(setupState.channelAddress);
    expect(fromStore).to.deep.eq(createState);

    const resolveState = createTestChannelState("resolve", {
      nonce: createState.nonce + 1,
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
      signatures: resolveState.latestUpdate.signatures,
      state: resolveState,
    });

    fromStore = await store.getChannelState(setupState.channelAddress);
    expect(fromStore).to.deep.eq(resolveState);
  });

  it("should create multiple active transfers", async () => {
    const transfer1 = createTestFullLinkedTransferState({
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
    });

    transfer1.transferResolver = undefined;
    createState.latestUpdate.details.merkleProofData;

    await store.saveChannelState(
      createState,
      {
        channelFactoryAddress: createState.networkContext.channelFactoryAddress,
        chainId: createState.networkContext.chainId,
        signatures: createState.latestUpdate.signatures,
        state: createState,
      },
      transfer1,
    );

    const transfer2 = createTestFullLinkedTransferState({
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
    });

    await store.saveChannelState(
      updatedState,
      {
        channelFactoryAddress: createState.networkContext.channelFactoryAddress,
        chainId: createState.networkContext.chainId,
        signatures: createState.latestUpdate.signatures,
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
});
