import { VectorEngine } from "@connext/vector-engine";
import { IVectorEngine } from "@connext/vector-types";
import { expect, getTestLoggers, GRPCServerNodeService } from "@connext/vector-utils";
import pino from "pino";
import { createStubInstance, SinonStubbedInstance } from "sinon";

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
  });

  it.only("should ping", async () => {
    const pong = await client.getPing();
    console.log("pong: ", pong);
    expect(pong.getError()).to.be.not.ok;
    console.log("pong.getValue(): ", pong.getValue());
    expect(pong.getValue()).to.eq("pong");
  });
});
