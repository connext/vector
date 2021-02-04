import { VectorEngine } from "@connext/vector-engine";
import { EngineEvents, IVectorEngine, NodeResponses, EngineEvent, FullTransferState } from "@connext/vector-types";
import {
  createTestChannelState,
  createTestFullHashlockTransferState,
  expect,
  getRandomIdentifier,
  getSignerAddressFromPublicIdentifier,
  getTestLoggers,
  GRPCServerNodeClient,
  mkAddress,
  mkHash,
  mkPublicIdentifier,
} from "@connext/vector-utils";
import pino from "pino";
import { createStubInstance, SinonStubbedInstance, stub } from "sinon";

import * as nodeUtils from "./helpers/nodes";
import { config } from "./config";
import { evts, setupServer } from "./grpcServer";

describe("GRPC server", () => {
  const { log: logger } = getTestLoggers("messaging", (config.logLevel ?? "fatal") as pino.Level);
  let engine: SinonStubbedInstance<IVectorEngine>;
  let client: GRPCServerNodeClient;

  before(async () => {
    await setupServer(5000);
    engine = createStubInstance(VectorEngine);
    client = await GRPCServerNodeClient.connect("localhost:5000", logger);
    stub(nodeUtils, "getNode").returns(engine as any);
  });

  it("should ping", async () => {
    const result = await client.getPing();
    expect(result.getError()).to.be.not.ok;
    expect(result.getValue()).to.eq("pong");
  });

  it("should getStatus", async () => {
    const pub = getRandomIdentifier();
    const expectedResponse: NodeResponses.GetStatus = {
      publicIdentifier: pub,
      signerAddress: getSignerAddressFromPublicIdentifier(pub),
      providerSyncing: {
        1337: {
          syncing: false,
          startingBlock: "0x384",
          currentBlock: "0x386",
          highestBlock: "0x454",
        },
      },
      version: "0.0.0",
    };

    engine.request.resolves({
      publicIdentifier: pub,
      signerAddress: getSignerAddressFromPublicIdentifier(pub),
      providerSyncing: expectedResponse,
    });
    const result = await client.getStatus(pub);
    expect(result.getError()).to.be.not.ok;
    expect(result.getValue()).to.deep.eq(expectedResponse);
  });

  it("should getRouterConfig", async () => {
    const expectedResponse: NodeResponses.GetRouterConfig = {
      supportedChains: [1337, 1338],
      allowedSwaps: [
        {
          fromAssetId: mkAddress("0x0"),
          fromChainId: 1337,
          toAssetId: mkAddress("0x0"),
          toChainId: 1338,
          hardcodedRate: "0.01",
          priceType: "hardcoded",
        },
        {
          fromAssetId: mkAddress("0x1"),
          fromChainId: 1338,
          toAssetId: mkAddress("0x1"),
          toChainId: 1337,
          hardcodedRate: "0.01",
          priceType: "hardcoded",
        },
      ],
    };

    engine.request.resolves(expectedResponse);
    const result = await client.getRouterConfig({
      routerIdentifier: mkPublicIdentifier("vectorA"),
      publicIdentifier: mkPublicIdentifier("vectorB"),
    });
    expect(result.getError()).to.be.not.ok;
    expect(result.getValue()).to.deep.eq(expectedResponse);
  });

  it("should getTransfer", async () => {
    const expectedResponse: FullTransferState = createTestFullHashlockTransferState();

    engine.request.resolves(expectedResponse);
    const result = await client.getTransfer({
      publicIdentifier: mkPublicIdentifier("vectorB"),
      transferId: mkHash("0xa"),
    });
    expect(result.getError()).to.be.not.ok;
    expect(result.getValue()).to.deep.eq(expectedResponse);
  });

  it("should getActiveTransfers", async () => {
    const expectedResponse: FullTransferState[] = [
      createTestFullHashlockTransferState(),
      createTestFullHashlockTransferState({ transferId: mkHash("0xbbb") }),
    ];

    engine.request.resolves(expectedResponse);
    const result = await client.getActiveTransfers({
      publicIdentifier: mkPublicIdentifier("vectorB"),
      channelAddress: mkAddress("0xa"),
    });
    expect(result.getError()).to.be.not.ok;
    expect(result.getValue()).to.deep.eq(expectedResponse);
  });

  it("should getTransferByRoutingId", async () => {
    const expectedResponse: FullTransferState = createTestFullHashlockTransferState();

    engine.request.resolves(expectedResponse);
    const result = await client.getTransferByRoutingId({
      publicIdentifier: mkPublicIdentifier("vectorB"),
      channelAddress: mkAddress("0xa"),
      routingId: mkHash("0xb"),
    });
    expect(result.getError()).to.be.not.ok;
    expect(result.getValue()).to.deep.eq(expectedResponse);
  });

  it("should getTransfersByRoutingId", async () => {
    const expectedResponse: FullTransferState[] = [
      createTestFullHashlockTransferState(),
      createTestFullHashlockTransferState({ transferId: mkHash("0xbbb") }),
    ];

    engine.request.resolves(expectedResponse);
    const result = await client.getTransfersByRoutingId({
      publicIdentifier: mkPublicIdentifier("vectorB"),
      routingId: mkHash("0xb"),
    });
    expect(result.getError()).to.be.not.ok;
    expect(result.getValue()).to.deep.eq(expectedResponse);
  });

  it.only("should getStateChannel", async () => {
    const expectedResponse = createTestChannelState("create").channel;

    engine.request.resolves(expectedResponse);
    const result = await client.getStateChannel({
      publicIdentifier: mkPublicIdentifier("vectorB"),
      channelAddress: mkAddress("0xa"),
    });
    expect(result.getError()).to.be.not.ok;
    expect(result.getValue()).to.deep.eq(expectedResponse);
  });

  describe("event handlers", () => {
    const testParams = [
      {
        payload: {
          aliceIdentifier: mkPublicIdentifier("vectorA"),
          bobIdentifier: mkPublicIdentifier("vectorB"),
          channelAddress: mkAddress("0xcc"),
          channelBalance: { amount: ["1", "2"], to: [mkAddress("0xa"), mkAddress("0xb")] },
          conditionType: "hello",
          transfer: createTestFullHashlockTransferState(),
          activeTransferIds: [],
        },
        eventName: EngineEvents.CONDITIONAL_TRANSFER_CREATED,
      },
      {
        payload: {
          aliceIdentifier: mkPublicIdentifier("vectorA"),
          bobIdentifier: mkPublicIdentifier("vectorB"),
          channelAddress: mkAddress("0xcc"),
          channelBalance: { amount: ["1", "2"], to: [mkAddress("0xa"), mkAddress("0xb")] },
          conditionType: "hello",
          transfer: createTestFullHashlockTransferState(),
          activeTransferIds: [],
        },
        eventName: EngineEvents.CONDITIONAL_TRANSFER_RESOLVED,
      },
      {
        payload: {
          aliceIdentifier: mkPublicIdentifier("vectorA"),
          bobIdentifier: mkPublicIdentifier("vectorB"),
          channelAddress: mkAddress("0xcc"),
          channelBalance: { amount: ["1", "2"], to: [mkAddress("0xa"), mkAddress("0xb")] },
          assetId: mkAddress("0xaaa"),
          meta: { hello: "world" },
        },
        eventName: EngineEvents.DEPOSIT_RECONCILED,
      },
      {
        payload: {
          aliceIdentifier: mkPublicIdentifier("vectorA"),
          bobIdentifier: mkPublicIdentifier("vectorB"),
          channelAddress: mkAddress("0xcc"),
          chainId: 1337,
        },
        eventName: EngineEvents.IS_ALIVE,
      },
      {
        payload: {
          aliceIdentifier: mkPublicIdentifier("vectorA"),
          bobIdentifier: mkPublicIdentifier("vectorB"),
          channelAddress: mkAddress("0xcc"),
          assetId: mkAddress("0xaaa"),
          amount: "1234",
          meta: { hello: "world" },
        },
        eventName: EngineEvents.REQUEST_COLLATERAL,
      },
      {
        payload: {
          aliceIdentifier: mkPublicIdentifier("vectorA"),
          bobIdentifier: mkPublicIdentifier("vectorB"),
          channelAddress: mkAddress("0xcc"),
          chainId: 1337,
          meta: { hello: "world" },
        },
        eventName: EngineEvents.RESTORE_STATE_EVENT,
      },
      {
        payload: {
          aliceIdentifier: mkPublicIdentifier("vectorA"),
          bobIdentifier: mkPublicIdentifier("vectorB"),
          channelAddress: mkAddress("0xcc"),
          chainId: 1337,
          meta: { hello: "world" },
        },
        eventName: EngineEvents.SETUP,
      },
      {
        payload: {
          aliceIdentifier: mkPublicIdentifier("vectorA"),
          bobIdentifier: mkPublicIdentifier("vectorB"),
          channelAddress: mkAddress("0xcc"),
          amount: "1234",
          assetId: mkAddress("0xaa"),
          callData: "0x",
          callTo: mkAddress("0xbb"),
          channelBalance: { amount: ["1", "2"], to: [mkAddress("0xaaa"), mkAddress("0xbbb")] },
          fee: "123",
          recipient: mkAddress("0xccc"),
          transfer: createTestFullHashlockTransferState(),
          meta: { hello: "world" },
        },
        eventName: EngineEvents.WITHDRAWAL_CREATED,
      },
      {
        payload: {
          aliceIdentifier: mkPublicIdentifier("vectorA"),
          bobIdentifier: mkPublicIdentifier("vectorB"),
          channelAddress: mkAddress("0xcc"),
          amount: "1234",
          assetId: mkAddress("0xaa"),
          callData: "0x",
          callTo: mkAddress("0xbb"),
          channelBalance: { amount: ["1", "2"], to: [mkAddress("0xaaa"), mkAddress("0xbbb")] },
          fee: "123",
          recipient: mkAddress("0xccc"),
          transfer: createTestFullHashlockTransferState(),
          meta: { hello: "world" },
        },
        eventName: EngineEvents.WITHDRAWAL_RESOLVED,
      },
      {
        payload: {
          aliceIdentifier: mkPublicIdentifier("vectorA"),
          bobIdentifier: mkPublicIdentifier("vectorB"),
          channelAddress: mkAddress("0xcc"),
          transactionHash: mkHash("0xabc"),
          transferId: mkHash("0xabcde"),
          meta: { hello: "world" },
        },
        eventName: EngineEvents.WITHDRAWAL_RECONCILED,
      },
    ];

    describe("on", () => {
      const onTestTemplate = ({ eventName, payload }: { eventName: EngineEvent; payload: any }) => {
        return new Promise<void>((res) => {
          client.on(
            eventName,
            (data) => {
              expect(data).to.deep.eq(payload);
              res();
            },
            undefined,
            mkPublicIdentifier("vectorB"),
          );

          evts[eventName].post(payload);
        });
      };

      for (const param of testParams) {
        it(`should work for on with ${param.eventName}`, async () => {
          await onTestTemplate(param);
        });
      }
    });

    describe("once", () => {
      const onceTestTemplate = ({ eventName, payload }: { eventName: EngineEvent; payload: any }) => {
        return new Promise<void>((res) => {
          client.once(
            eventName,
            (data) => {
              expect(data).to.deep.eq(payload);
              res();
            },
            undefined,
            mkPublicIdentifier("vectorB"),
          );

          evts[eventName].post(payload);
        });
      };

      for (const param of testParams) {
        it(`should work for once with ${param.eventName}`, async () => {
          await onceTestTemplate(param);
        });
      }
    });

    describe("waitFor", () => {
      const waitForTestTemplate = async ({ eventName, payload }: { eventName: EngineEvent; payload: any }) => {
        engine.waitFor.yields(payload);

        const dataProm = client.waitFor(eventName, 1000, undefined, mkPublicIdentifier("vectorB"));
        evts[eventName].post(payload);
        const data = await dataProm;
        expect(data).to.deep.eq(payload);
      };

      for (const param of testParams) {
        it(`should work for once with ${param.eventName}`, async () => {
          await waitForTestTemplate(param);
        });
      }
    });
  });
});
