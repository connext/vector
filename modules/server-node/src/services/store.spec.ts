import { Balance } from "@connext/vector-types";
import { createCoreTransferState, createTestChannelState } from "@connext/vector-utils";

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
  });

  after(async () => {
    await store.disconnect();
  });

  it("should save and retrieve all update types and keep updating the channel", async () => {
    const setupState = createTestChannelState("setup");
    await store.saveChannelState(setupState, {
      adjudicatorAddress: setupState.networkContext.adjudicatorAddress,
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
      adjudicatorAddress: depositState.networkContext.adjudicatorAddress,
      chainId: depositState.networkContext.chainId,
      signatures: depositState.latestUpdate.signatures,
      state: depositState,
    });

    fromStore = await store.getChannelState(setupState.channelAddress);
    expect(fromStore).to.deep.eq(depositState);

    const createState = createTestChannelState("create", {
      nonce: depositState.nonce + 1,
    });
    await store.saveChannelState(createState, {
      adjudicatorAddress: createState.networkContext.adjudicatorAddress,
      chainId: createState.networkContext.chainId,
      signatures: createState.latestUpdate.signatures,
      state: createState,
    });

    fromStore = await store.getChannelState(setupState.channelAddress);
    expect(fromStore).to.deep.eq(createState);

    const resolveState = createTestChannelState("resolve", {
      nonce: createState.nonce + 1,
    });
    await store.saveChannelState(resolveState, {
      adjudicatorAddress: resolveState.networkContext.adjudicatorAddress,
      chainId: resolveState.networkContext.chainId,
      signatures: resolveState.latestUpdate.signatures,
      state: resolveState,
    });

    fromStore = await store.getChannelState(setupState.channelAddress);
    expect(fromStore).to.deep.eq(resolveState);
  });

  it("should create and resolve a transfer and pull transfer by ID", async () => {
    const createState = createTestChannelState("create");
    const transfer = createCoreTransferState({ channelAddress: createState.channelAddress });

    await store.saveChannelState(
      createState,
      {
        adjudicatorAddress: createState.networkContext.adjudicatorAddress,
        chainId: createState.networkContext.chainId,
        signatures: createState.latestUpdate.signatures,
        state: createState,
      },
      transfer,
    );
  });
});
