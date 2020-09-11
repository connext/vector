import { createTestChannelState } from "../test/utils/channel";
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

  it("should save and retrieve channel update", async () => {
    const state = createTestChannelState();
    await store.saveChannelState(state);

    const fromStore = await store.getChannelState(state.channelAddress);
    expect(fromStore).to.deep.eq(state);
  });
});
