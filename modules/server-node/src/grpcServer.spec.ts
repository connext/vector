import { VectorEngine } from "@connext/vector-engine";
import { IVectorEngine, NodeResponses } from "@connext/vector-types";
import {
  expect,
  getRandomIdentifier,
  getSignerAddressFromPublicIdentifier,
  getTestLoggers,
  GRPCServerNodeService,
  mkAddress,
  mkPublicIdentifier,
} from "@connext/vector-utils";
import pino from "pino";
import { createStubInstance, SinonStubbedInstance, stub } from "sinon";

import * as nodeUtils from "./helpers/nodes";
import { config } from "./config";
import { setupServer } from "./grpcServer";

describe("GRPC server", () => {
  const { log: logger } = getTestLoggers("messaging", (config.logLevel ?? "fatal") as pino.Level);
  let engine: SinonStubbedInstance<IVectorEngine>;
  let client: GRPCServerNodeService;

  before(async () => {
    await setupServer(5000);
    engine = createStubInstance(VectorEngine);
    client = await GRPCServerNodeService.connect("localhost:5000", logger);
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

  it("should on", async () => {});
});
