import { VectorOnchainService } from "@connext/vector-contracts";
import {
  getRandomChannelSigner,
  mkAddress,
  mkBytes32,
  mkPublicIdentifier,
  createTestLinkedTransferState,
} from "@connext/vector-utils";
import pino from "pino";
import {
  LinkedTransferResolverEncoding,
  LinkedTransferStateEncoding,
  OutboundChannelUpdateError,
  IVectorOnchainService,
} from "@connext/vector-types";
import Sinon from "sinon";

import { Vector } from "../vector";

import { MemoryMessagingService } from "./services/messaging";
import { MemoryLockService } from "./services/lock";
import { MemoryStoreService } from "./services/store";
import { expect } from "./utils";

let chainService: IVectorOnchainService;
beforeEach(async () => {
  chainService = Sinon.createStubInstance(VectorOnchainService);
});

afterEach(() => {
  Sinon.restore();
});

describe("Vector.connect", () => {
  it("can be created", async () => {
    const signer = getRandomChannelSigner();
    const node = await Vector.connect(
      new MemoryMessagingService(),
      new MemoryLockService(),
      new MemoryStoreService(),
      signer,
      chainService,
      pino(),
    );
    expect(node).to.be.instanceOf(Vector);
    expect(node.publicIdentifier).to.be.eq(signer.publicIdentifier);
    expect(node.signerAddress).to.be.eq(signer.address);
  });
});

type ParamValidationTest = {
  name: string;
  params: any;
  error: string;
};

describe("Vector.setup", () => {
  let vector: Vector;

  beforeEach(async () => {
    const signer = getRandomChannelSigner();
    vector = await Vector.connect(
      new MemoryMessagingService(),
      new MemoryLockService(),
      new MemoryStoreService(),
      signer,
      chainService,
      pino(),
    );
  });

  describe("should validate parameters", () => {
    const network = {
      chainId: 2,
      providerUrl: "http://eth.com",
      channelFactoryAddress: mkAddress("ccc"),
      channelMastercopyAddress: mkAddress("eee"),
    };
    const validParams = {
      counterpartyIdentifier: mkPublicIdentifier(),
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
        error: 'should match pattern "^indra([a-zA-Z0-9]{50})$"',
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
        name: "should fail if there is no channelMastercopyAddress",
        params: { ...validParams, networkContext: { ...network, channelMastercopyAddress: undefined } },
        error: "should have required property 'channelMastercopyAddress'",
      },
      {
        name: "should fail if there is an invalid channelMastercopyAddress",
        params: { ...validParams, networkContext: { ...network, channelMastercopyAddress: "fail" } },
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
        expect(error?.context?.errors).to.include(t.error);
      });
    }
  });
});

describe("Vector.deposit", () => {
  let vector: Vector;

  beforeEach(async () => {
    const signer = getRandomChannelSigner();

    vector = await Vector.connect(
      new MemoryMessagingService(),
      new MemoryLockService(),
      new MemoryStoreService(),
      signer,
      chainService,
      pino(),
    );
  });

  describe("should validate parameters", () => {
    const validParams = {
      channelAddress: mkAddress("ccc"),
      amount: "12039",
      assetId: mkAddress("aaa"),
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
        expect(err?.context?.errors).to.include(error);
      });
    }
  });
});

describe("Vector.create", () => {
  let vector: Vector;

  beforeEach(async () => {
    const signer = getRandomChannelSigner();

    vector = await Vector.connect(
      new MemoryMessagingService(),
      new MemoryLockService(),
      new MemoryStoreService(),
      signer,
      chainService,
      pino(),
    );
  });

  describe("should validate parameters", () => {
    const validParams = {
      channelAddress: mkAddress("ccc"),
      amount: "123214",
      assetId: mkAddress("aaa"),
      transferDefinition: mkAddress("def"),
      transferInitialState: createTestLinkedTransferState(),
      timeout: "133215",
      encodings: [LinkedTransferStateEncoding, LinkedTransferResolverEncoding],
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
        name: "should fail if amount is undefined",
        params: { ...validParams, amount: undefined },
        error: "should have required property 'amount'",
      },
      {
        name: "should fail if amount is invalid",
        params: { ...validParams, amount: "fail" },
        error: 'should match pattern "^([0-9])*$"',
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
        error: "should have required property 'transferInitialState'",
      },
      {
        name: "should fail if transferInitialState is invalid",
        params: { ...validParams, transferInitialState: {} },
        error:
          "should have required property 'balance',should have required property 'balance',should match exactly one schema in oneOf",
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
      {
        name: "should fail if encodings is undefined",
        params: { ...validParams, encodings: undefined },
        error: "should have required property 'encodings'",
      },
      {
        name: "should fail if encodings is invalid",
        params: { ...validParams, encodings: [] },
        error: "should match exactly one schema in oneOf",
      },
    ];

    for (const { params, name, error } of tests) {
      it(name, async () => {
        const ret = await vector.create(params);
        expect(ret.isError).to.be.true;
        const err = ret.getError();
        expect(err?.message).to.be.eq(OutboundChannelUpdateError.reasons.InvalidParams);
        expect(err?.context?.errors).to.include(error);
      });
    }
  });
});

describe("Vector.resolve", () => {
  let vector: Vector;

  beforeEach(async () => {
    const signer = getRandomChannelSigner();

    vector = await Vector.connect(
      new MemoryMessagingService(),
      new MemoryLockService(),
      new MemoryStoreService(),
      signer,
      chainService,
      pino(),
    );
  });

  describe("should validate parameters", () => {
    const validParams = {
      channelAddress: mkAddress("ccc"),
      transferId: mkBytes32("aaabbb"),
      transferResolver: {
        preImage: mkBytes32("eeeeffff"),
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
        error: "should have required property 'transferResolver'",
      },
      {
        name: "should fail if transferResolver is invalid",
        params: { ...validParams, transferResolver: { test: "fail" } },
        error:
          "should have required property 'preImage',should have required property 'responderSignature',should match exactly one schema in oneOf",
      },
    ];

    for (const { params, name, error } of tests) {
      it(name, async () => {
        const ret = await vector.resolve(params);
        expect(ret.isError).to.be.true;
        const err = ret.getError();
        expect(err?.message).to.be.eq(OutboundChannelUpdateError.reasons.InvalidParams);
        expect(err?.context?.errors).to.include(error);
      });
    }
  });
});
