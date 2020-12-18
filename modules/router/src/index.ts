import fastify from "fastify";
import metricsPlugin from "fastify-metrics";
import pino from "pino";
import { Evt } from "evt";
import { EventCallbackConfig, RestServerNodeService } from "@connext/vector-utils";
import {
  ConditionalTransferCreatedPayload,
  ConditionalTransferResolvedPayload,
  DepositReconciledPayload,
  EngineEvents,
  IsAlivePayload,
  RequestCollateralPayload,
} from "@connext/vector-types";
import { Registry } from "prom-client";

import { config } from "./config";
import { IRouter, Router } from "./router";
import { PrismaStore } from "./services/store";

const routerPort = 8000;
const routerBase = `http://router:${routerPort}`;
const conditionalTransferCreatedPath = "/conditional-transfer-created";
const conditionalTransferResolvedPath = "/conditional-transfer-resolved";
const depositReconciledPath = "/deposit-reconciled";
const requestCollateralPath = "/request-collateral";
const isAlivePath = "/is-alive";
const evts: EventCallbackConfig = {
  [EngineEvents.IS_ALIVE]: {
    evt: Evt.create<IsAlivePayload>(),
    url: `${routerBase}${conditionalTransferCreatedPath}`,
  },
  [EngineEvents.SETUP]: {},
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
  [EngineEvents.REQUEST_COLLATERAL]: {
    evt: Evt.create<RequestCollateralPayload>(),
    url: `${routerBase}${requestCollateralPath}`,
  },
  [EngineEvents.WITHDRAWAL_CREATED]: {},
  [EngineEvents.WITHDRAWAL_RECONCILED]: {},
  [EngineEvents.WITHDRAWAL_RESOLVED]: {},
};

const logger = pino();
logger.info({ config }, "Loaded config from environment");
const server = fastify({ logger, disableRequestLogging: config.logLevel !== "debug" });

const register = new Registry();
server.register(metricsPlugin, { endpoint: "/metrics", prefix: "router_", register });

let router: IRouter;
const store = new PrismaStore();

server.addHook("onReady", async () => {
  const nodeService = await RestServerNodeService.connect(
    config.nodeUrl,
    logger.child({ module: "RestServerNodeService" }),
    evts,
    0,
  );
  router = await Router.connect(
    nodeService.publicIdentifier,
    nodeService.signerAddress,
    nodeService,
    store,
    logger,
    register,
  );
});

server.get("/ping", async () => {
  return "pong\n";
});

server.post(isAlivePath, async (request, response) => {
  evts[EngineEvents.IS_ALIVE].evt!.post(request.body as IsAlivePayload);
  return response.status(200).send({ message: "success" });
});

server.post(conditionalTransferCreatedPath, async (request, response) => {
  evts[EngineEvents.CONDITIONAL_TRANSFER_CREATED].evt!.post(request.body as ConditionalTransferCreatedPayload);
  return response.status(200).send({ message: "success" });
});

server.post(conditionalTransferResolvedPath, async (request, response) => {
  evts[EngineEvents.CONDITIONAL_TRANSFER_RESOLVED].evt!.post(request.body as ConditionalTransferResolvedPayload);
  return response.status(200).send({ message: "success" });
});

server.post(depositReconciledPath, async (request, response) => {
  evts[EngineEvents.DEPOSIT_RECONCILED].evt!.post(request.body as DepositReconciledPayload);
  return response.status(200).send({ message: "success" });
});

server.post(requestCollateralPath, async (request, response) => {
  evts[EngineEvents.REQUEST_COLLATERAL].evt!.post(request.body as RequestCollateralPayload);
  return response.status(200).send({ message: "success" });
});

server.listen(routerPort, "0.0.0.0", (err, address) => {
  if (err) {
    console.error(err);
    process.exit(1);
  }
  console.log(`Server listening at ${address}`);
});
