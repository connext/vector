import { IStoreService } from "@connext/vector-types";

import { getMemoryStore } from "../index";

import { createTestChannelState } from "./utils/channel";
import { expect } from "./utils/assert";

describe("store", () => {
  let store: IStoreService;
  beforeEach(() => {
    store = getMemoryStore();
  });
  it("should save a channel update", async () => {
    const state = createTestChannelState();
    await store.saveChannelState(state);

    const fromStore = await store.getChannelState(state.channelAddress);
    expect(fromStore).to.deep.eq(state);
  });
});
