import fastify from "fastify";
import fastifyOas from "fastify-oas";
import pino from "pino";
import { Evt } from "evt";
import { RestServerNodeService } from "@connext/vector-utils";
import {
  ConditionalTransferCreatedPayload,
  ConditionalTransferResolvedPayload,
  EngineEvents,
} from "@connext/vector-types";

import { config } from "./config";
import { IRouter, Router } from "./router";
import { RouterStore } from "./services/store";

const evts = {
  [EngineEvents.CONDITIONAL_TRANSFER_CREATED]: Evt.create<ConditionalTransferCreatedPayload>(),
  [EngineEvents.CONDITIONAL_TRANSFER_RESOLVED]: Evt.create<ConditionalTransferResolvedPayload>(),
};

const server = fastify();
server.register(fastifyOas, {
  swagger: {
    info: {
      title: "Vector Routing-Node",
      version: "0.0.1",
    },
  },
  exposeRoute: true,
});

const logger = pino();
let router: IRouter;
const store = new RouterStore();
server.addHook("onReady", async () => {
  const node = await RestServerNodeService.connect(
    config.serverNodeUrl,
    config.chainProviders,
    logger.child({ module: "RestServerNodeService" }),
    `http://router:${config.port}`,
    evts,
  );
  router = await Router.connect(node, store, logger);
});

server.get("/ping", async () => {
  return "pong\n";
});

server.post("/conditional-transfer-created", async (request, response) => {
  evts[EngineEvents.CONDITIONAL_TRANSFER_CREATED].post(request.body as ConditionalTransferCreatedPayload);
  return response.status(200).send({ message: "success" });
});

server.post("/conditional-transfer-resolved", async (request, response) => {
  evts[EngineEvents.CONDITIONAL_TRANSFER_RESOLVED].post(request.body as ConditionalTransferResolvedPayload);
  return response.status(200).send({ message: "success" });
});

server.listen(config.port, "0.0.0.0", (err, address) => {
  if (err) {
    console.error(err);
    process.exit(1);
  }
  console.log(`Server listening at ${address}`);
});
