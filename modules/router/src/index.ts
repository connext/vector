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
  NodeParams,
  TransferDefundedPayload,
  TransferDisputedPayload,
  ChannelDefundedPayload,
  ChannelDisputedPayload,
} from "@connext/vector-types";
import { collectDefaultMetrics, register } from "prom-client";
import { Wallet } from "ethers";

import { getConfig } from "./config";
import { IRouter, Router } from "./router";
import { PrismaStore } from "./services/store";
import { NatsRouterMessagingService } from "./services/messaging";
import { autoRebalanceTask, startAutoRebalanceTask } from "./services/autoRebalance";
import { wallet } from "./metrics";
import { ServerError } from "./errors";

const config = getConfig();

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
const channelDisputedPath = "/channel-disputed";
const channelDefundedPath = "/channel-defunded";
const transferDisputedPath = "/transfer-disputed";
const transferDefundedPath = "/transfer-defunded";
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
  [EngineEvents.CHANNEL_DISPUTED]: {
    evt: Evt.create<ChannelDisputedPayload & { publicIdentifier: string }>(),
    url: `${routerBase}${channelDisputedPath}`,
  },
  [EngineEvents.CHANNEL_DEFUNDED]: {
    evt: Evt.create<ChannelDefundedPayload & { publicIdentifier: string }>(),
    url: `${routerBase}${channelDefundedPath}`,
  },
  [EngineEvents.TRANSFER_DISPUTED]: {
    evt: Evt.create<TransferDisputedPayload & { publicIdentifier: string }>(),
    url: `${routerBase}${transferDisputedPath}`,
  },
  [EngineEvents.TRANSFER_DEFUNDED]: {
    evt: Evt.create<TransferDefundedPayload & { publicIdentifier: string }>(),
    url: `${routerBase}${transferDefundedPath}`,
  },
};

const signer = new ChannelSigner(Wallet.fromMnemonic(config.mnemonic).privateKey);

const logger = pino({ name: signer.publicIdentifier, level: config.logLevel });
logger.info("Loaded config from environment");
const server = fastify({
  logger,
  pluginTimeout: 300_000,
  disableRequestLogging: config.logLevel !== "debug",
  bodyLimit: 10485760,
});

collectDefaultMetrics({ prefix: "router_" });

let router: IRouter;
const store = new PrismaStore();
const hydratedProviders = hydrateProviders(config.chainProviders);
const chainService = new VectorChainReader(hydratedProviders, logger.child({ module: "RouterChainReader" }));
const messagingService = new NatsRouterMessagingService({
  signer,
  logger: logger.child({ module: "NatsRouterMessagingService" }),
  messagingUrl: config.messagingUrl,
});

server.addHook("onReady", async () => {
  const nodeService = await RestServerNodeService.connect(
    config.nodeUrl,
    logger.child({ module: "RouterNodeService" }),
    evts,
    0,
    true,
  );

  if (nodeService.publicIdentifier !== signer.publicIdentifier) {
    throw new Error("Router signer misconfigured, node and router have different identifiers");
  }

  const nodeConfigs = await nodeService.getConfig();
  if (nodeConfigs.isError) {
    throw nodeConfigs.getError();
  }
  const nodeConfig = nodeConfigs.getValue().find((c) => c.publicIdentifier === signer.publicIdentifier);
  if (!nodeConfig) {
    throw new Error("Router node config not available");
  }

  router = await Router.connect(
    signer,
    nodeConfig.chainAddresses,
    nodeService,
    chainService,
    store,
    messagingService,
    logger,
  );

  if (config.autoRebalanceInterval) {
    startAutoRebalanceTask(config.autoRebalanceInterval, logger, wallet, chainService, hydratedProviders, store);
  }
});

server.get("/ping", async () => {
  return "pong\n";
});

// TODO: use this endpoint to broadcast metrics via nats for
// network level observability
server.get("/metrics", async (request, response) => {
  const res = await register.metrics();
  return response.status(200).send(res);
});

// ADMIN FUNCTIONS
server.post<{ Body: NodeParams.Admin }>(
  "/auto-rebalance",
  { schema: { body: NodeParams.AdminSchema } },
  async (request, response) => {
    if (request.body.adminToken !== config.adminToken) {
      return response.status(401).send(new ServerError(ServerError.reasons.Unauthorized, request.body).toJson());
    }

    await autoRebalanceTask(logger, wallet, chainService, hydratedProviders, store);
    return response.status(200).send({ message: "success" });
  },
);

// EVENT HANDLERS

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

server.post(channelDisputedPath, async (request, response) => {
  evts[EngineEvents.CHANNEL_DISPUTED].evt!.post(request.body as ChannelDisputedPayload & { publicIdentifier: string });
  return response.status(200).send({ message: "success" });
});

server.post(channelDefundedPath, async (request, response) => {
  evts[EngineEvents.CHANNEL_DEFUNDED].evt!.post(request.body as ChannelDefundedPayload & { publicIdentifier: string });
  return response.status(200).send({ message: "success" });
});

server.post(transferDisputedPath, async (request, response) => {
  evts[EngineEvents.TRANSFER_DISPUTED].evt!.post(
    request.body as TransferDisputedPayload & { publicIdentifier: string },
  );
  return response.status(200).send({ message: "success" });
});

server.post(transferDefundedPath, async (request, response) => {
  evts[EngineEvents.TRANSFER_DEFUNDED].evt!.post(
    request.body as TransferDefundedPayload & { publicIdentifier: string },
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
