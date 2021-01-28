import fastify from "fastify";
import metricsPlugin from "fastify-metrics";
import pino from "pino";
import { Gauge } from "prom-client";
import {
  getPublicIdentifierFromPublicKey,
  getSignerAddressFromPublicIdentifier,
  hydrateProviders,
} from "@connext/vector-utils";
import { HydratedProviders } from "@connext/vector-types";
import { Wallet } from "@ethersproject/wallet";
import { formatEther } from "@ethersproject/units";

import { config } from "./config";

const logger = pino({ name: "Metrics Collector" });
logger.info({ config }, "Loaded config from environment");

const routerPublicIdentifier = getPublicIdentifierFromPublicKey(Wallet.fromMnemonic(config.mnemonic).publicKey);
const routerSignerAddress = getSignerAddressFromPublicIdentifier(routerPublicIdentifier);

const server = fastify({ logger, pluginTimeout: 300_000, disableRequestLogging: config.logLevel !== "debug" });

server.register(metricsPlugin, { endpoint: "/metrics", prefix: "collector_" });

const hydrated: HydratedProviders = hydrateProviders(config.chainProviders);

// create gauge for each rebalanced asset and each native asset for the signer address
Object.entries(hydrated).forEach(([chainId, provider]) => {
  // base asset
  new Gauge({
    name: `chain-${chainId}-base-asset`,
    help: "",
    async collect() {
      const balance = await provider.getBalance(routerSignerAddress);
      this.set(parseFloat(formatEther(balance)));
    },
  });

  config.rebalanceProfiles.filter((prof) => prof.chainId === chainId);
});

server.listen(3000, "0.0.0.0", (err, address) => {
  if (err) {
    console.error(err);
    process.exit(1);
  }
  console.log(`Metrics collector server listening at ${address}`);
});
