import "core-js/stable";
import "regenerator-runtime/runtime";
import fastify from "fastify";
import pino from "pino";
import { Evt } from "evt";
import { VectorChainReader } from "@connext/vector-contracts";
import { EventCallbackConfig, hydrateProviders, RestServerNodeService, ChannelSigner } from "@connext/vector-utils";
import {
  IsAlivePayload,
  ConditionalTransferCreatedPayload,
  ConditionalTransferResolvedPayload,
  DepositReconciledPayload,
  EngineEvents,
  RequestCollateralPayload,
  RestoreStatePayload,
  WithdrawalCreatedPayload,
  WithdrawalReconciledPayload,
  WithdrawalResolvedPayload,
  TransactionSubmittedPayload,
  TransactionMinedPayload,
  TransactionFailedPayload,
  SetupPayload,
} from "@connext/vector-types";
import { collectDefaultMetrics, register } from "prom-client";
import { Wallet } from "ethers";

import { config } from "./config";
import { IRouter, Router } from "./router";
import { PrismaStore } from "./services/store";
import { NatsRouterMessagingService } from "./services/messaging";

const routerPort = 8000;
const routerBase = `http://router:${routerPort}`;
const isAlivePath = "/is-alive";
const setupPath = "/setup";
const conditionalTransferCreatedPath = "/conditional-transfer-created";
const conditionalTransferResolvedPath = "/conditional-transfer-resolved";
const depositReconciledPath = "/deposit-reconciled";
const requestCollateralPath = "/request-collateral";
const restoreStatePath = "/restore-state";
const withdrawalCreatedPath = "/withdrawal-created";
const withdrawReconciledPath = "/withdrawal-reconciled";
const withdrawResolvedPath = "/withdrawal-resolved";
const transactionSubmittedPath = "/transaction-submitted";
const transactionMinedPath = "/transaction-mined";
const transactionFailedPath = "/transaction-failed";
const evts: EventCallbackConfig = {
  [EngineEvents.IS_ALIVE]: {
    evt: Evt.create<IsAlivePayload>(),
    url: `${routerBase}${isAlivePath}`,
  },
  [EngineEvents.SETUP]: {
    evt: Evt.create<SetupPayload>(),
    url: `${routerBase}${setupPath}`,
  },
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
  [EngineEvents.RESTORE_STATE_EVENT]: {
    evt: Evt.create<RestoreStatePayload>(),
    url: `${routerBase}${restoreStatePath}`,
  },
  [EngineEvents.WITHDRAWAL_CREATED]: {
    evt: Evt.create<WithdrawalCreatedPayload>(),
    url: `${routerBase}${withdrawalCreatedPath}`,
  },
  [EngineEvents.WITHDRAWAL_RECONCILED]: {
    evt: Evt.create<WithdrawalReconciledPayload>(),
    url: `${routerBase}${withdrawReconciledPath}`,
  },
  [EngineEvents.WITHDRAWAL_RESOLVED]: {
    evt: Evt.create<WithdrawalResolvedPayload>(),
    url: `${routerBase}${withdrawResolvedPath}`,
  },
  [EngineEvents.TRANSACTION_SUBMITTED]: {
    evt: Evt.create<TransactionSubmittedPayload & { publicIdentifier: string }>(),
    url: `${routerBase}${transactionSubmittedPath}`,
  },
  [EngineEvents.TRANSACTION_MINED]: {
    evt: Evt.create<TransactionMinedPayload & { publicIdentifier: string }>(),
    url: `${routerBase}${transactionMinedPath}`,
  },
  [EngineEvents.TRANSACTION_FAILED]: {
    evt: Evt.create<TransactionFailedPayload & { publicIdentifier: string }>(),
    url: `${routerBase}${transactionFailedPath}`,
  },
};

const signer = new ChannelSigner(Wallet.fromMnemonic(config.mnemonic).privateKey);

const logger = pino({ name: signer.publicIdentifier });
logger.info({ config }, "Loaded config from environment");
const server = fastify({ logger, pluginTimeout: 300_000, disableRequestLogging: config.logLevel !== "debug" });

collectDefaultMetrics({ prefix: "router_" });

let router: IRouter;
const store = new PrismaStore();

// create gauge to store balance for each rebalanced asset and each native asset for the signer address
// TODO: maybe want to look into an API rather than blowing up our eth providers? although its not that many calls

server.addHook("onReady", async () => {
  const messagingService = new NatsRouterMessagingService({
    signer,
    logger: logger.child({ module: "NatsRouterMessagingService" }),
    messagingUrl: config.messagingUrl,
  });
  const nodeService = await RestServerNodeService.connect(
    config.nodeUrl,
    logger.child({ module: "RouterNodeService" }),
    evts,
    0,
    true,
  );
  const chainService = new VectorChainReader(
    hydrateProviders(config.chainProviders),
    logger.child({ module: "RouterChainReader" }),
  );

  router = await Router.connect(
    nodeService.publicIdentifier,
    nodeService.signerAddress,
    nodeService,
    chainService,
    store,
    messagingService,
    logger,
  );
});

server.get("/ping", async () => {
  return "pong\n";
});

// TODO: the fastify plugin is not updated with the latest prom-client which supports async collect
// in the meantime, we are implementing this ourselves
// https://github.com/SkeLLLa/fastify-metrics/issues/21
server.get("/metrics", async (request, response) => {
  const res = await register.metrics();
  return response.status(200).send(res);
});

server.post(isAlivePath, async (request, response) => {
  evts[EngineEvents.IS_ALIVE].evt!.post(request.body as IsAlivePayload);
  return response.status(200).send({ message: "success" });
});

server.post(setupPath, async (request, response) => {
  evts[EngineEvents.SETUP].evt!.post(request.body as SetupPayload);
  return response.status(200).send({ message: "success" });
});

server.post(restoreStatePath, async (request, response) => {
  evts[EngineEvents.RESTORE_STATE_EVENT].evt!.post(request.body as RestoreStatePayload);
  return response.status(200).send({ message: "success" });
});

server.post(withdrawalCreatedPath, async (request, response) => {
  evts[EngineEvents.WITHDRAWAL_CREATED].evt!.post(request.body as WithdrawalCreatedPayload);
  return response.status(200).send({ message: "success" });
});

server.post(withdrawReconciledPath, async (request, response) => {
  evts[EngineEvents.WITHDRAWAL_RECONCILED].evt!.post(request.body as WithdrawalReconciledPayload);
  return response.status(200).send({ message: "success" });
});

server.post(withdrawResolvedPath, async (request, response) => {
  evts[EngineEvents.WITHDRAWAL_RESOLVED].evt!.post(request.body as WithdrawalResolvedPayload);
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

server.post(transactionSubmittedPath, async (request, response) => {
  evts[EngineEvents.TRANSACTION_SUBMITTED].evt!.post(
    request.body as TransactionSubmittedPayload & { publicIdentifier: string },
  );
  return response.status(200).send({ message: "success" });
});

server.post(transactionMinedPath, async (request, response) => {
  evts[EngineEvents.TRANSACTION_MINED].evt!.post(
    request.body as TransactionMinedPayload & { publicIdentifier: string },
  );
  return response.status(200).send({ message: "success" });
});

server.post(transactionFailedPath, async (request, response) => {
  evts[EngineEvents.TRANSACTION_FAILED].evt!.post(
    request.body as TransactionFailedPayload & { publicIdentifier: string },
  );
  return response.status(200).send({ message: "success" });
});

server.listen(routerPort, "0.0.0.0", (err, address) => {
  if (err) {
    console.error(err);
    process.exit(1);
  }
  console.log(`Server listening at ${address}`);
});
