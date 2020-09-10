import { getRandomChannelSigner } from "@connext/vector-utils";

import { Vector } from "../vector";

import { MemoryMessagingService } from "./services/messaging";
import { MemoryLockService } from "./services/lock";
import { MemoryStoreService } from "./services/store";
import { expect } from "./utils/assert";

describe("Vector", () => {
  it("is defined", () => {
    expect(Vector).to.be.ok;
  });

  it("can be created", async () => {
    const node = await Vector.connect(
      new MemoryMessagingService(),
      new MemoryLockService(),
      new MemoryStoreService(),
      getRandomChannelSigner(),
    );
    expect(node).to.be.ok;
  });
});
