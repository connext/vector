import { VectorEngine } from "@connext/vector-engine";
import { IVectorEngine, NodeResponses } from "@connext/vector-types";
import {
  expect,
  getRandomIdentifier,
  getSignerAddressFromPublicIdentifier,
  getTestLoggers,
  GRPCServerNodeService,
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

  it.only("should getStatus", async () => {
    const pub = getRandomIdentifier();
    engine.request.resolves({
      publicIdentifier: pub,
      signerAddress: getSignerAddressFromPublicIdentifier(pub),
      providerSyncing: {
        startingBlock: "0x384",
        currentBlock: "0x386",
        highestBlock: "0x454",
      },
      version: "0.0.0",
    } as NodeResponses.GetStatus);
    const result = await client.getStatus(pub);
    expect(result.getError()).to.be.not.ok;
    console.log("result.getValue(): ", result.getValue());
    expect(result.getValue()).to.eq("pong");
  });
});
