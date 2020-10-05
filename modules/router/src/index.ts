import fastify from "fastify";
import fastifyOas from "fastify-oas";
import pino from "pino";
import { Evt } from "evt";
import { RestServerNodeService } from "@connext/vector-utils";
import {
  ConditionalTransferCreatedPayload,
  ConditionalTransferResolvedPayload,
  DepositReconciledPayload,
  EngineEvents,
} from "@connext/vector-types";

import { config } from "./config";
import { IRouter, Router } from "./router";
import { RouterStore } from "./services/store";

const routerBase = `http://router:${config.port}`;
const conditionalTransferCreatedPath = "/conditional-transfer-created";
const conditionalTransferResolvedPath = "/conditional-transfer-resolved";
const depositReconciledPath = "/deposit-reconciled";
const evts = {
  [EngineEvents.CONDITIONAL_TRANSFER_CREATED]: {
    evt: Evt.create<ConditionalTransferCreatedPayload>(),
    url: `${routerBase}${conditionalTransferCreatedPath}`,
  },
  [EngineEvents.CONDITIONAL_TRANSFER_RESOLVED]: {
    evt: Evt.create<ConditionalTransferResolvedPayload>(),
    url: `${routerBase}${conditionalTransferResolvedPath}`,
  },
  [EngineEvents.DEPOSIT_RECONCILED]: {
    evt: Evt.create<DepositReconciledPayload>(),
    url: `${routerBase}${depositReconciledPath}`,
  },
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
    config.nodeUrl,
    config.chainProviders,
    logger.child({ module: "RestServerNodeService" }),
    evts,
  );
  router = await Router.connect(node, store, logger);
});

server.get("/ping", async () => {
  return "pong\n";
});

server.post(conditionalTransferCreatedPath, async (request, response) => {
  evts[EngineEvents.CONDITIONAL_TRANSFER_CREATED].evt.post(request.body as ConditionalTransferCreatedPayload);
  return response.status(200).send({ message: "success" });
});

server.post(conditionalTransferResolvedPath, async (request, response) => {
  evts[EngineEvents.CONDITIONAL_TRANSFER_RESOLVED].evt.post(request.body as ConditionalTransferResolvedPayload);
  return response.status(200).send({ message: "success" });
});

server.post(depositReconciledPath, async (request, response) => {
  evts[EngineEvents.DEPOSIT_RECONCILED].evt.post(request.body as DepositReconciledPayload);
  return response.status(200).send({ message: "success" });
});

server.listen(config.port, "0.0.0.0", (err, address) => {
  if (err) {
    console.error(err);
    process.exit(1);
  }
  console.log(`Server listening at ${address}`);
});
