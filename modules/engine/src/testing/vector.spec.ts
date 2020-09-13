import { getRandomChannelSigner } from "@connext/vector-utils";

import { Vector } from "../vector";

import { MemoryMessagingService } from "./services/messaging";
import { MemoryLockService } from "./services/lock";
import { MemoryStoreService } from "./services/store";
import { expect } from "./utils/assert";
import { config } from "./services/config";

describe("Vector.connect", () => {
  it("can be created", async () => {
    const signer = getRandomChannelSigner();
    const node = await Vector.connect(
      new MemoryMessagingService(),
      new MemoryLockService(),
      new MemoryStoreService(),
      signer,
      config.chainProviders,
      {} as any,
    );
    expect(node).to.be.instanceOf(Vector);
    expect(node.publicIdentifier).to.be.eq(signer.publicIdentifier);
    expect(node.signerAddress).to.be.eq(signer.address);
  });
});
