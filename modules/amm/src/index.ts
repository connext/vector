// import "core-js/stable";
// import "regenerator-runtime/runtime";
import fastify from "fastify";
import fastifyCors from "fastify-cors";
import pino from "pino";
import {
  ChannelRpcMethods,
  EngineEvent,
  ChainError,
  NodeParams,
  NodeResponses,
  TPublicIdentifier,
  jsonifyError,
} from "@connext/vector-types";
import { Static, Type } from "@sinclair/typebox";

import { config } from "./config";
import { Aggregator } from "./aggregator";

export const logger = pino({ name: "", level: config.logLevel ?? "info" });
logger.info("Loaded config from environment", { ...config, mnemonic: "", adminToken: "" });
const server = fastify({
  logger,
  pluginTimeout: 300_000,
  disableRequestLogging: config.logLevel !== "debug",
  bodyLimit: 52428800,
});
server.register(fastifyCors, {
  origin: "*",
  methods: ["GET", "PUT", "POST", "OPTIONS"],
  preflightContinue: true,
});

server.addHook("onReady", async () => {
  // TODO: When this service starts, it needs to get the balance for each [active?] on- and off-chain channel
  // from the DB, and add that to the router's current signer balance to get the total liquidity for each
  // asset the router serves.
});

const aggregator = Aggregator();

server.get("/ping", async () => {
  return "pong\n";
});

server.get<{ Params: { assetId: string, chainId: number } }>(
  "/liquidity/:assetId/:chainId",
  { schema: { params: Type.Object({ publicIdentifier: TPublicIdentifier }) } },
  async (request, reply) => {
    try {
      const res = await aggregator.getLiquidity(assetId, chainId)
      return reply.status(200).send();
    } catch (e) {
      logger.error({ error: jsonifyError(e) });
      return reply.status(500).send(jsonifyError(e));
    }
  },
);
  
server.listen(8000, "0.0.0.0", (err, address) => {
  if (err) {
    logger.error(err);
    process.exit(1);
  }
    logger.info(`Server listening at ${address}`);
});
