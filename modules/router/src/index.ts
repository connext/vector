import fastify from "fastify";
import fastifyOas from "fastify-oas";
import metricsPlugin from "fastify-metrics";
import pino from "pino";
import { Evt } from "evt";
import { RestServerNodeService } from "@connext/vector-utils";
import {
  ConditionalTransferCreatedPayload,
  ConditionalTransferResolvedPayload,
  DepositReconciledPayload,
  EngineEvents,
  INodeService,
} from "@connext/vector-types";
import { Registry, Gauge } from "prom-client";

import { config } from "./config";
import { IRouter, Router } from "./router";
import { RouterStore } from "./services/store";

const PORT = 8000;

const routerBase = `http://router:${PORT}`;
const conditionalTransferCreatedPath = "/conditional-transfer-created";
const conditionalTransferResolvedPath = "/conditional-transfer-resolved";
const depositReconciledPath = "/deposit-reconciled";
const evts = {
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
  [EngineEvents.WITHDRAWAL_CREATED]: {},
  [EngineEvents.WITHDRAWAL_RECONCILED]: {},
  [EngineEvents.WITHDRAWAL_RESOLVED]: {},
};

const logger = pino();
const server = fastify({ logger });
server.register(fastifyOas, {
  swagger: {
    info: {
      title: "Vector Routing-Node",
      version: "0.0.1",
    },
  },
  exposeRoute: true,
});

const register = new Registry();
server.register(metricsPlugin, { endpoint: "/metrics", prefix: "router_", register });

let router: IRouter;
const store = new RouterStore();

server.addHook("onReady", async () => {
  const nodeService = await RestServerNodeService.connect(
    config.nodeUrl,
    logger.child({ module: "RestServerNodeService" }),
    evts,
  );
  // Create signer at 0
  const node = await nodeService.createNode({ index: 0 });
  if (node.isError) {
    throw node.getError();
  }
  const { publicIdentifier, signerAddress } = node.getValue();
  router = await Router.connect(publicIdentifier, signerAddress, nodeService, store, logger);
  configureMetrics(register, nodeService, publicIdentifier, signerAddress);
});

const configureMetrics = (
  register: Registry,
  nodeService: INodeService,
  publicIdentifier: string,
  signerAddress: string,
) => {
  // Track the total number of channels
  const channelCounter = new Gauge({
    name: "router_channels_total",
    help: "router_channels_total_help",
    registers: [register],
  });

  // Track the total number of payments
  const paymentCounter = new Gauge({
    name: "router_payments_total",
    help: "router_payments_total_help",
    labelNames: ["channelAddress"],
    registers: [register],
  });

  // TODO: fix this once this issue is fixed by using the `collect` function in the gauge
  // https://github.com/siimon/prom-client/issues/383
  setInterval(async () => {
    logger.info({}, "Collecting metrics");
    const channels = await nodeService.getStateChannels({ publicIdentifier });
    if (channels.isError) {
      logger.error({ error: channels.getError()!.message, publicIdentifier }, "Failed to fetch channels");
      return;
    }
    const channelAddresses = channels.getValue();
    channelCounter.set(channelAddresses.length);

    for (const channelAddr of channelAddresses) {
      const payments = await nodeService.getActiveTransfers({ channelAddress: channelAddr, publicIdentifier });
      if (payments.isError) {
        logger.error(
          { error: payments.getError()!.message, channelAddress: channelAddr },
          "Failed to get active payments",
        );
        return;
      }
      paymentCounter.set({ channelAddress: channelAddr }, payments.getValue().length);
    }
  }, 30_000);
};

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

server.listen(PORT, "0.0.0.0", (err, address) => {
  if (err) {
    console.error(err);
    process.exit(1);
  }
  console.log(`Server listening at ${address}`);
});
