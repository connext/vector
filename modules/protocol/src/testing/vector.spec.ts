import { VectorChainReader } from "@connext/vector-contracts";
import {
  getRandomChannelSigner,
  mkAddress,
  mkBytes32,
  mkPublicIdentifier,
  createTestHashlockTransferState,
  createTestChannelState,
  createTestUpdateParams,
  mkHash,
  MemoryStoreService,
  expect,
  MemoryMessagingService,
  MemoryLockService,
} from "@connext/vector-utils";
import pino from "pino";
import {
  OutboundChannelUpdateError,
  IVectorChainReader,
  ILockService,
  IMessagingService,
  IVectorStore,
  UpdateType,
  Result,
  CreateTransferParams,
  ChainError,
} from "@connext/vector-types";
import Sinon from "sinon";

import { Vector } from "../vector";
import * as vectorSync from "../sync";

describe("Vector", () => {
  let chainReader: Sinon.SinonStubbedInstance<IVectorChainReader>;
  let lockService: Sinon.SinonStubbedInstance<ILockService>;
  let messagingService: Sinon.SinonStubbedInstance<IMessagingService>;
  let storeService: Sinon.SinonStubbedInstance<IVectorStore>;

  beforeEach(async () => {
    chainReader = Sinon.createStubInstance(VectorChainReader);
    chainReader.getChannelFactoryBytecode.resolves(Result.ok(mkHash()));
    chainReader.getChannelMastercopyAddress.resolves(Result.ok(mkAddress()));
    lockService = Sinon.createStubInstance(MemoryLockService);
    messagingService = Sinon.createStubInstance(MemoryMessagingService);
    storeService = Sinon.createStubInstance(MemoryStoreService);
    storeService.getChannelStates.resolves([]);
    // Mock sync outbound
    Sinon.stub(vectorSync, "outbound").resolves(
      Result.ok({ updatedChannel: createTestChannelState(UpdateType.setup) }),
    );
  });

  afterEach(() => {
    Sinon.restore();
  });

  describe("Vector.connect", () => {
    it("should work", async () => {
      const signer = getRandomChannelSigner();
      const node = await Vector.connect(messagingService, lockService, storeService, signer, chainReader, pino());
      expect(node).to.be.instanceOf(Vector);
      expect(node.publicIdentifier).to.be.eq(signer.publicIdentifier);
      expect(node.signerAddress).to.be.eq(signer.address);

      // Verify that the messaging service callback was registered
      expect(messagingService.onReceiveProtocolMessage.callCount).to.eq(1);

      // Verify sync was tried
      // expect(storeService.getChannelStates.callCount).to.eq(1);
    });
  });

  type ParamValidationTest = {
    name: string;
    params: any;
    error: string;
  };

  describe("Vector.setup", () => {
    let vector: Vector;
    const counterpartyIdentifier = getRandomChannelSigner().publicIdentifier;

    beforeEach(async () => {
      const signer = getRandomChannelSigner();
      storeService.getChannelStates.resolves([]);
      vector = await Vector.connect(messagingService, lockService, storeService, signer, chainReader, pino());
    });

    it("should work", async () => {
      const { details } = createTestUpdateParams(UpdateType.setup, {
        details: { counterpartyIdentifier },
      });
      const result = await vector.setup(details);
      expect(result.getError()).to.be.undefined;
      expect(lockService.acquireLock.callCount).to.be.eq(1);
      expect(lockService.releaseLock.callCount).to.be.eq(1);
    });

    it("should fail if it fails to generate the create2 address", async () => {
      // Sinon has issues mocking out modules, we could use `proxyquire` but that
      // seems a bad choice since we use the utils within the tests
      // Instead, force a create2 failure by forcing a chainReader failure
      chainReader.getChannelFactoryBytecode.resolves(Result.fail(new ChainError(ChainError.reasons.ProviderNotFound)));
      const { details } = createTestUpdateParams(UpdateType.setup);
      const result = await vector.setup(details);
      expect(result.getError()?.message).to.be.eq(OutboundChannelUpdateError.reasons.Create2Failed);
    });

    describe("should validate parameters", () => {
      const network = {
        chainId: 2,
        providerUrl: "http://eth.com",
        channelFactoryAddress: mkAddress("0xccc"),
        transferRegistryAddress: mkAddress("0xdef"),
      };
      const validParams = {
        counterpartyIdentifier,
        networkContext: { ...network },
        timeout: "1000",
      };
      const tests: ParamValidationTest[] = [
        {
          name: "should fail if there is no counterparty",
          params: { ...validParams, counterpartyIdentifier: undefined },
          error: "should have required property 'counterpartyIdentifier'",
        },
        {
          name: "should fail if there is an invalid counterparty",
          params: { ...validParams, counterpartyIdentifier: "fail" },
          error: 'should match pattern "^vector([a-zA-Z0-9]{50})$"',
        },
        {
          name: "should fail if there is no transferRegistryAddress",
          params: {
            ...validParams,
            networkContext: { ...validParams.networkContext, transferRegistryAddress: undefined },
          },
          error: "should have required property 'transferRegistryAddress'",
        },
        {
          name: "should fail if there is an invalid transferRegistryAddress",
          params: {
            ...validParams,
            networkContext: { ...validParams.networkContext, transferRegistryAddress: "fail" },
          },
          error: 'should match pattern "^0x[a-fA-F0-9]{40}$"',
        },
        {
          name: "should fail if there is no chainId",
          params: { ...validParams, networkContext: { ...network, chainId: undefined } },
          error: "should have required property 'chainId'",
        },
        {
          name: "should fail if there is an invalid chainId (is a string)",
          params: { ...validParams, networkContext: { ...network, chainId: "fail" } },
          error: "should be number",
        },
        {
          name: "should fail if the chainId is below the minimum",
          params: { ...validParams, networkContext: { ...network, chainId: 0 } },
          error: "should be >= 1",
        },
        {
          name: "should fail if there is no providerUrl",
          params: { ...validParams, networkContext: { ...network, providerUrl: undefined } },
          error: "should have required property 'providerUrl'",
        },
        {
          name: "should fail if there is an invalid providerUrl",
          params: { ...validParams, networkContext: { ...network, providerUrl: 0 } },
          error: "should be string",
        },
        {
          name: "should fail if there is no channelFactoryAddress",
          params: { ...validParams, networkContext: { ...network, channelFactoryAddress: undefined } },
          error: "should have required property 'channelFactoryAddress'",
        },
        {
          name: "should fail if there is an invalid channelFactoryAddress",
          params: { ...validParams, networkContext: { ...network, channelFactoryAddress: "fail" } },
          error: 'should match pattern "^0x[a-fA-F0-9]{40}$"',
        },
        {
          name: "should fail if there is no timeout",
          params: { ...validParams, timeout: undefined },
          error: "should have required property 'timeout'",
        },
        {
          name: "should fail if there is an invalid timeout",
          params: { ...validParams, timeout: "fail" },
          error: 'should match pattern "^([0-9])*$"',
        },
      ];
      for (const t of tests) {
        it(t.name, async () => {
          const ret = await vector.setup(t.params);
          expect(ret.isError).to.be.true;
          const error = ret.getError();
          expect(error?.message).to.be.eq(OutboundChannelUpdateError.reasons.InvalidParams);
          expect(error?.context?.error).to.include(t.error);
        });
      }
    });
  });

  describe("Vector.deposit", () => {
    let vector: Vector;
    const channelAddress: string = mkAddress("0xccc");

    beforeEach(async () => {
      const signer = getRandomChannelSigner();

      storeService.getChannelState.resolves(createTestChannelState(UpdateType.setup, { channelAddress }));

      vector = await Vector.connect(messagingService, lockService, storeService, signer, chainReader, pino());
    });

    it("should work", async () => {
      const { details } = createTestUpdateParams(UpdateType.deposit, { channelAddress });
      const result = await vector.deposit(details);
      expect(result.getError()).to.be.undefined;
      expect(lockService.acquireLock.callCount).to.be.eq(1);
      expect(lockService.releaseLock.callCount).to.be.eq(1);
    });

    describe("should validate parameters", () => {
      const validParams = {
        channelAddress,
        amount: "12039",
        assetId: mkAddress("0xaaa"),
      };

      const tests: ParamValidationTest[] = [
        {
          name: "should fail if channelAddress is undefined",
          params: { ...validParams, channelAddress: undefined },
          error: "should have required property 'channelAddress'",
        },
        {
          name: "should fail if channelAddress is invalid",
          params: { ...validParams, channelAddress: "fail" },
          error: 'should match pattern "^0x[a-fA-F0-9]{40}$"',
        },
        {
          name: "should fail if assetId is undefined",
          params: { ...validParams, assetId: undefined },
          error: "should have required property 'assetId'",
        },
        {
          name: "should fail if assetId is invalid",
          params: { ...validParams, assetId: "fail" },
          error: 'should match pattern "^0x[a-fA-F0-9]{40}$"',
        },
      ];

      for (const { params, name, error } of tests) {
        it(name, async () => {
          const ret = await vector.deposit(params);
          expect(ret.isError).to.be.true;
          const err = ret.getError();
          expect(err?.message).to.be.eq(OutboundChannelUpdateError.reasons.InvalidParams);
          expect(err?.context?.error).to.include(error);
        });
      }
    });
  });

  describe("Vector.create", () => {
    let vector: Vector;
    const channelAddress: string = mkAddress("0xccc");

    beforeEach(async () => {
      const signer = getRandomChannelSigner();

      storeService.getChannelState.resolves(createTestChannelState(UpdateType.setup, { channelAddress }));

      vector = await Vector.connect(messagingService, lockService, storeService, signer, chainReader, pino());
    });

    it("should work", async () => {
      const { details } = createTestUpdateParams(UpdateType.create, { channelAddress });
      const result = await vector.create(details);
      expect(result.getError()).to.be.undefined;
      expect(lockService.acquireLock.callCount).to.be.eq(1);
      expect(lockService.releaseLock.callCount).to.be.eq(1);
    });

    describe("should validate parameters", () => {
      const validParams: CreateTransferParams = {
        channelAddress,
        balance: { to: [mkAddress("0x111"), mkAddress("0x222")], amount: ["123214", "0"] },
        assetId: mkAddress("0xaaa"),
        transferDefinition: mkAddress("0xdef"),
        transferInitialState: createTestHashlockTransferState(),
        timeout: "133215",
      };

      const tests: ParamValidationTest[] = [
        {
          name: "should fail if channelAddress is undefined",
          params: { ...validParams, channelAddress: undefined },
          error: "should have required property 'channelAddress'",
        },
        {
          name: "should fail if channelAddress is invalid",
          params: { ...validParams, channelAddress: "fail" },
          error: 'should match pattern "^0x[a-fA-F0-9]{40}$"',
        },
        {
          name: "should fail if balance is undefined",
          params: { ...validParams, balance: undefined },
          error: "should have required property 'balance'",
        },
        {
          name: "should fail if balance is invalid",
          params: { ...validParams, balance: "fail" },
          error: "should be object",
        },
        {
          name: "should fail if assetId is undefined",
          params: { ...validParams, assetId: undefined },
          error: "should have required property 'assetId'",
        },
        {
          name: "should fail if assetId is invalid",
          params: { ...validParams, assetId: "fail" },
          error: 'should match pattern "^0x[a-fA-F0-9]{40}$"',
        },
        {
          name: "should fail if transferDefinition is undefined",
          params: { ...validParams, transferDefinition: undefined },
          error: "should have required property 'transferDefinition'",
        },
        {
          name: "should fail if transferDefinition is invalid",
          params: { ...validParams, transferDefinition: "fail" },
          error: 'should match pattern "^0x[a-fA-F0-9]{40}$"',
        },
        {
          name: "should fail if transferInitialState is undefined",
          params: { ...validParams, transferInitialState: undefined },
          error: "should have required property '.transferInitialState'",
        },
        {
          name: "should fail if timeout is undefined",
          params: { ...validParams, timeout: undefined },
          error: "should have required property 'timeout'",
        },
        {
          name: "should fail if timeout is invalid",
          params: { ...validParams, timeout: "fail" },
          error: 'should match pattern "^([0-9])*$"',
        },
      ];

      for (const { params, name, error } of tests) {
        it(name, async () => {
          const ret = await vector.create(params);
          expect(ret.isError).to.be.true;
          const err = ret.getError();
          expect(err?.message).to.be.eq(OutboundChannelUpdateError.reasons.InvalidParams);
          expect(err?.context?.error).to.include(error);
        });
      }
    });
  });

  describe("Vector.resolve", () => {
    let vector: Vector;
    const channelAddress: string = mkAddress("0xccc");

    beforeEach(async () => {
      const signer = getRandomChannelSigner();

      storeService.getChannelState.resolves(createTestChannelState(UpdateType.setup, { channelAddress }));

      vector = await Vector.connect(messagingService, lockService, storeService, signer, chainReader, pino());
    });

    it("should work", async () => {
      const { details } = createTestUpdateParams(UpdateType.resolve, { channelAddress });
      const result = await vector.resolve(details);
      expect(result.getError()).to.be.undefined;
      expect(lockService.acquireLock.callCount).to.be.eq(1);
      expect(lockService.releaseLock.callCount).to.be.eq(1);
    });

    describe("should validate parameters", () => {
      const validParams = {
        channelAddress,
        transferId: mkBytes32("0xaaabbb"),
        transferResolver: {
          preImage: mkBytes32("0xeeeeffff"),
        },
      };

      const tests: ParamValidationTest[] = [
        {
          name: "should fail if channelAddress is undefined",
          params: { ...validParams, channelAddress: undefined },
          error: "should have required property 'channelAddress'",
        },
        {
          name: "should fail if channelAddress is invalid",
          params: { ...validParams, channelAddress: "fail" },
          error: 'should match pattern "^0x[a-fA-F0-9]{40}$"',
        },
        {
          name: "should fail if transferId is undefined",
          params: { ...validParams, transferId: undefined },
          error: "should have required property 'transferId'",
        },
        {
          name: "should fail if transferId is invalid",
          params: { ...validParams, transferId: "fail" },
          error: 'should match pattern "^0x([a-fA-F0-9]{64})$"',
        },
        {
          name: "should fail if transferResolver is undefined",
          params: { ...validParams, transferResolver: undefined },
          error: "should have required property '.transferResolver'",
        },
      ];

      for (const { params, name, error } of tests) {
        it(name, async () => {
          const ret = await vector.resolve(params);
          expect(ret.isError).to.be.true;
          const err = ret.getError();
          expect(err?.message).to.be.eq(OutboundChannelUpdateError.reasons.InvalidParams);
          expect(err?.context?.error).to.include(error);
        });
      }
    });
  });
});
