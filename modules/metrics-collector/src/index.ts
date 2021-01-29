import fastify from "fastify";
import metricsPlugin from "fastify-metrics";
import pino from "pino";
import { Gauge } from "prom-client";
import {
  getPublicIdentifierFromPublicKey,
  getSignerAddressFromPublicIdentifier,
  hydrateProviders,
} from "@connext/vector-utils";
import { HydratedProviders, ERC20Abi } from "@connext/vector-types";
import { BigNumber } from "@ethersproject/bignumber";
import { AddressZero } from "@ethersproject/constants";
import { Contract } from "@ethersproject/contracts";
import { Wallet } from "@ethersproject/wallet";
import { formatEther, formatUnits } from "@ethersproject/units";

import { config } from "./config";

const logger = pino({ name: "Metrics Collector" });
logger.info({ config }, "Loaded config from environment");

const routerPublicIdentifier = getPublicIdentifierFromPublicKey(Wallet.fromMnemonic(config.mnemonic).publicKey);
const routerSignerAddress = getSignerAddressFromPublicIdentifier(routerPublicIdentifier);

const server = fastify({ logger, pluginTimeout: 300_000, disableRequestLogging: config.logLevel !== "debug" });

server.register(metricsPlugin, { endpoint: "/metrics", prefix: "collector_" });

const hydrated: HydratedProviders = hydrateProviders(config.chainProviders);

// create gauge for each rebalanced asset and each native asset for the signer address
// TODO: maybe want to look into an API rather than blowing up our eth providers? although its not that many calls
Object.entries(hydrated).forEach(([chainId, provider]) => {
  // base asset
  new Gauge({
    name: `chain_${chainId}_base_asset`,
    help: `chain_${chainId}_base_asset_help`,
    async collect() {
      const balance = await provider.getBalance(routerSignerAddress);
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
    new Gauge({
      name: `chain_${chainId}_asset`,
      help: `chain_${chainId}_asset_help`,
      async collect() {
        const decimals = tokens[assetId].decimals ?? (await tokens[assetId].contract.decimals());
        const balance = await tokens[assetId].contract.balanceOf(routerSignerAddress);
        this.set(parseFloat(formatUnits(balance, decimals)));
      },
    });
  });
});

server.listen(3000, "0.0.0.0", (err, address) => {
  if (err) {
    console.error(err);
    process.exit(1);
  }
  console.log(`Metrics collector server listening at ${address}`);
});
