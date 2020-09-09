import { getRandomChannelSigner } from "@connext/utils";

import { Vector } from "../vector";
import { memoryMessagingService } from "./testing/services";
import { MemoryLockService } from "./testing/services/memory-lock-service";
import { getMemoryStore } from "./testing/services/memory-store";

import { expect } from "./testing/assertions";

describe("Vector", () => {
  it("is defined", () => {
    expect(Vector).to.be.ok;
  });

  it("can be created", async () => {
    const store = getMemoryStore();
    await store.init();
    const node = await Vector.connect(memoryMessagingService, new MemoryLockService(), store, getRandomChannelSigner());
    expect(node).to.be.ok;
  });
});
