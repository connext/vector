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

  // TODO: all methods should have tests that ensure every failure can be hit
  // below outlines only the most important (i.e. functions with the most
  // complex logic within the index file of the module)

  describe("setup", () => {
    it("should fail if it cannot get chainProviders", async () => {});
    it("should fail if vector.setup fails", async () => {});
    it("should work when signer is bob", async () => {});
    describe("should work when signer is alice", () => {
      it("should work without deploying contract", async () => {});
      it("should try to deploy channel on autodeployable chain", async () => {});
    });
  });

  describe("withdraw", () => {
    it("should fail if getting channel fails", async () => {});
    it("should fail if the channel is undefined", async () => {});
    it("should fail if it cannot convert the params", async () => {});
    it("should fail if vector.create fails", async () => {});
    it("should resolve with the transactionHash once the withdrawal is reconciled", async () => {});
    it("should resolve without the transactionHash once the withdrawal is reconciled if no event is emitted", async () => {});
  });

  // NOTE: if any of these change we have broken the rpc interface!
  describe.skip("should properly parse rpc request schema", () => {
    it("should fail if it has no request.id", () => {});
    it("should fail if it has invalid request.id", () => {});
    it("should fail if it has no request.jsonrpc", () => {});
    it("should fail if it has invalid request.jsonrpc", () => {});
    it("should fail if it has no request.method", () => {});
    it("should fail if it has invalid request.method", () => {});
    describe("should fail if it has invalid request.params", () => {
      // TODO: all channel method RPC validation params should be tested
      // for `invalid` fields or nonexistent fields
    });
  });
});
