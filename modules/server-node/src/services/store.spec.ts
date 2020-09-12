import { Balance } from "@connext/vector-types";
import { createTestChannelState } from "@connext/vector-utils";

import { expect } from "../test/utils/assert";

import { PrismaStore } from "./store";

describe("store", () => {
  let store: PrismaStore;

  before(() => {
    store = new PrismaStore();
  });

  beforeEach(async () => {
    await store.prisma.balance.deleteMany({});
    await store.prisma.update.deleteMany({});
    await store.prisma.channel.deleteMany({});
  });

  afterEach(async () => {
    await store.prisma.balance.deleteMany({});
    await store.prisma.update.deleteMany({});
    await store.prisma.channel.deleteMany({});
  });

  after(async () => {
    await store.disconnect();
  });

  it("should save and retrieve all update types and keep updating the channel", async () => {
    const setupState = createTestChannelState("setup");
    await store.saveChannelState(setupState);

    let fromStore = await store.getChannelState(setupState.channelAddress);
    expect(fromStore).to.deep.eq(setupState);

    const updatedBalanceForDeposit: Balance = { amount: ["10", "20"], to: setupState.balances[0].to };
    const depositState = createTestChannelState("deposit", {
      nonce: setupState.nonce + 1,
      balances: [updatedBalanceForDeposit, setupState.balances[0]],
    });
    await store.saveChannelState(depositState);

    fromStore = await store.getChannelState(setupState.channelAddress);
    expect(fromStore).to.deep.eq(depositState);

    const createState = createTestChannelState("create", {
      nonce: depositState.nonce + 1,
    });
    await store.saveChannelState(createState);

    fromStore = await store.getChannelState(setupState.channelAddress);
    expect(fromStore).to.deep.eq(createState);

    const resolveState = createTestChannelState("resolve", {
      nonce: createState.nonce + 1,
    });
    await store.saveChannelState(resolveState);

    fromStore = await store.getChannelState(setupState.channelAddress);
    expect(fromStore).to.deep.eq(resolveState);
  });
});
