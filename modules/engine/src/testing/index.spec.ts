import { VectorChainService } from "@connext/vector-contracts";
import { Result } from "@connext/vector-types";
import {
  expect,
  getRandomChannelSigner,
  getTestLoggers,
  MemoryStoreService,
  MemoryMessagingService,
  MemoryLockService,
} from "@connext/vector-utils";
import Sinon from "sinon";

import { VectorEngine } from "../index";

import { env } from "./env";

const testName = "VectorEngine index utils";
const { log } = getTestLoggers(testName, env.logLevel);

describe("VectorEngine", () => {
  const chainId = parseInt(Object.keys(env.chainProviders)[0]);
  const chainAddresses = {
    [chainId]: {
      ...env.chainAddresses,
    },
  };

  let storeService;
  beforeEach(() => {
    storeService = Sinon.createStubInstance(MemoryStoreService, {
      getChannelStates: Promise.resolve([]),
    });
  });

  afterEach(() => Sinon.restore());

  it("should connect without validation", async () => {
    const engine = await VectorEngine.connect(
      Sinon.createStubInstance(MemoryMessagingService),
      Sinon.createStubInstance(MemoryLockService),
      storeService,
      getRandomChannelSigner(),
      Sinon.createStubInstance(VectorChainService),
      chainAddresses,
      log,
    );
    expect(engine).to.be.instanceOf(VectorEngine);
  });

  it("should connect with validation", async () => {
    const engine = await VectorEngine.connect(
      Sinon.createStubInstance(MemoryMessagingService),
      Sinon.createStubInstance(MemoryLockService),
      storeService,
      getRandomChannelSigner(),
      Sinon.createStubInstance(VectorChainService),
      chainAddresses,
      log,
      {
        validateInbound: (update, state, transfer) => Promise.resolve(Result.ok(undefined)),
        validateOutbound: (params, state, transfer) => Promise.resolve(Result.ok(undefined)),
      },
    );
    expect(engine).to.be.instanceOf(VectorEngine);
  });
});
