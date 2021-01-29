import "core-js/stable";
import "regenerator-runtime/runtime";
import fastify from "fastify";
import metricsPlugin from "fastify-metrics";
import pino from "pino";
import { Evt } from "evt";
import { VectorChainReader } from "@connext/vector-contracts";
import {
  EventCallbackConfig,
  hydrateProviders,
  RestServerNodeService,
  ChannelSigner,
  getPublicIdentifierFromPublicKey,
  getSignerAddressFromPublicIdentifier,
} from "@connext/vector-utils";
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
  HydratedProviders,
  ERC20Abi,
} from "@connext/vector-types";
import { Gauge, Registry } from "prom-client";
import { Wallet } from "ethers";

import { config } from "./config";
import { IRouter, Router } from "./router";
import { PrismaStore } from "./services/store";
import { NatsRouterMessagingService } from "./services/messaging";
import { AddressZero } from "@ethersproject/constants";
import { formatEther, formatUnits } from "@ethersproject/units";
import { Contract } from "@ethersproject/contracts";
import { BigNumber } from "@ethersproject/bignumber";

const routerPort = 8000;
const routerBase = `http://router:${routerPort}`;
const conditionalTransferCreatedPath = "/conditional-transfer-created";
const conditionalTransferResolvedPath = "/conditional-transfer-resolved";
const depositReconciledPath = "/deposit-reconciled";
const requestCollateralPath = "/request-collateral";
const checkInPath = "/check-in";
const restoreStatePath = "/restore-state";
const withdrawalCreatedPath = "/withdrawal-created";
const withdrawReconciledPath = "/withdrawal-reconciled";
const withdrawResolvedPath = "/withdrawal-resolved";
const evts: EventCallbackConfig = {
  [EngineEvents.IS_ALIVE]: {
    evt: Evt.create<IsAlivePayload>(),
    url: `${routerBase}${checkInPath}`,
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
};

const configuredIdentifier = getPublicIdentifierFromPublicKey(Wallet.fromMnemonic(config.mnemonic).publicKey);
const configuredSigner = getSignerAddressFromPublicIdentifier(configuredIdentifier);

const logger = pino({ name: configuredIdentifier });
logger.info({ config }, "Loaded config from environment");
const server = fastify({ logger, pluginTimeout: 300_000, disableRequestLogging: config.logLevel !== "debug" });

const register = new Registry();
server.register(metricsPlugin, { endpoint: "/metrics", prefix: "router_" });

let router: IRouter;
const store = new PrismaStore();

const hydrated: HydratedProviders = hydrateProviders(config.chainProviders);

// create gauge for each rebalanced asset and each native asset for the signer address
// TODO: maybe want to look into an API rather than blowing up our eth providers? although its not that many calls
const gauges: { [chainId: string]: { [asset: string]: Gauge<string> } } = {};
Object.entries(hydrated).forEach(([chainId, provider]) => {
  // base asset
  gauges[chainId] = {};
  gauges[chainId][AddressZero] = new Gauge({
    name: `chain_${chainId}_base_asset`,
    help: `chain_${chainId}_base_asset_help`,
    registers: [register],
    async collect() {
      const balance = await provider.getBalance(configuredSigner);
      // NOTE: seems to not be getting scraped at interval
      console.log("***** calling set on base gauge");
      this.set(parseFloat(formatEther(balance)));
    },
  });

  // get all non-zero addresses
  const assets = config.rebalanceProfiles
    .filter((prof) => prof.chainId.toString() === chainId && prof.assetId !== AddressZero)
    .map((p) => p.assetId);

  const tokens: { [asset: string]: { contract: Contract; decimals?: BigNumber } } = {};
  assets.forEach((asset) => {
    tokens[asset] = {
      contract: new Contract(asset, ERC20Abi, provider),
      decimals: undefined,
    };
  });
  assets.forEach((assetId) => {
    gauges[chainId][assetId] = new Gauge({
      name: `chain_${chainId}_asset_${assetId}`,
      help: `chain_${chainId}_asset_${assetId}_help`,
      registers: [register],
      async collect() {
        const decimals = tokens[assetId].decimals ?? (await tokens[assetId].contract.functions.decimals());
        const balance = await tokens[assetId].contract.balanceOf(configuredSigner);
        // NOTE: seems to not be getting scraped at interval
        console.log("***** calling set on asset gauge");
        this.set(parseFloat(formatUnits(balance, decimals)));
      },
    });
  });
});

server.addHook("onReady", async () => {
  const signer = new ChannelSigner(Wallet.fromMnemonic(config.mnemonic).privateKey);

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
    register,
  );
});

server.get("/ping", async () => {
  return "pong\n";
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

server.post(checkInPath, async (request, response) => {
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
