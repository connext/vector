import { IStoreService } from "@connext/vector-types";

import { createTestChannelState } from "../test/utils/channel";
import { expect } from "../test/utils/assert";

import { Store } from "./store";

describe("store", () => {
  let store: IStoreService;
  before(() => {
    store = new Store();
  });
  it("should save a channel update", async () => {
    const state = createTestChannelState();
    await store.saveChannelState(state);

    const fromStore = await store.getChannelState(state.channelAddress);
    expect(fromStore).to.deep.eq(state);
  });
});
