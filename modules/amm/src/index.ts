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
import { createNode, deleteNodes, getChainService, getNode, getNodes } from "./helpers/nodes";

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

server.get("/ping", async () => {
  return "pong\n";
});

// server.get("/config", { schema: { response: NodeResponses.GetConfigSchema } }, async (request, reply) => {
//   const nodes = getNodes();
//   return reply.status(200).send(
//     nodes.map((node) => {
//       return {
//         index: node.index,
//         publicIdentifier: node.node.publicIdentifier,
//         signerAddress: node.node.signerAddress,
//         chainAddresses: config.chainAddresses,
//       };
//     }),
//   );
// });

server.get<{ Params: { assetId: string, chainId: number } }>(
  "/liquidity/:assetId/:chainId",
  { schema: { params: Type.Object({ publicIdentifier: TPublicIdentifier }) } },
  async (request, reply) => {
    const engine = getNode(request.params.publicIdentifier);
    if (!engine) {
      return reply
        .status(400)
        .send(
          jsonifyError(
            new ServerNodeError(ServerNodeError.reasons.NodeNotFound, request.params.publicIdentifier, request.params),
          ),
        );
    }
    try {
      const params = constructRpcRequest(ChannelRpcMethods.chan_getStatus, {});
      const res = await engine.request<"chan_getStatus">(params);
      return reply.status(200).send(res);
    } catch (e) {
      logger.error({ error: jsonifyError(e) });
      return reply.status(500).send(jsonifyError(e));
    }
  },
);

server.get<{ Params: NodeParams.GetRouterConfig }>(
  "/:publicIdentifier/router/config/:routerIdentifier",
  { schema: { params: NodeParams.GetRouterConfigSchema } },
  async (request, reply) => {
    const engine = getNode(request.params.publicIdentifier);
    if (!engine) {
      return reply
        .status(400)
        .send(
          jsonifyError(
            new ServerNodeError(ServerNodeError.reasons.NodeNotFound, request.params.publicIdentifier, request.params),
          ),
        );
    }
    const params = constructRpcRequest(ChannelRpcMethods.chan_getRouterConfig, request.params);
    try {
      const res = await engine.request<"chan_getRouterConfig">(params);
      return reply.status(200).send(res);
    } catch (e) {
      logger.error({ error: jsonifyError(e) });
      return reply.status(500).send(jsonifyError(e));
    }
  },
);

const JsonRpcRequestSchema = Type.Object({
  method: Type.String(),
  params: Type.Any(),
});
type JsonRpcRequest = Static<typeof JsonRpcRequestSchema>;
  
server.post<{ Params: { chainId: string }; Body: JsonRpcRequest }>(
  "/ethprovider/:chainId",
  { schema: { body: JsonRpcRequestSchema } },
  async (request, reply) => {
    const provider = _providers[parseInt(request.params.chainId)];
    if (!provider) {
      return reply
        .status(400)
        .send(new ServerNodeError(ServerNodeError.reasons.ProviderNotConfigured, "", request.body.params).toJson());
    }
    try {
      const result = await provider.send(request.body.method, request.body.params);
      return reply.status(200).send({ result });
    } catch (e) {
      // Do not touch provider errors
      return reply.status(500).send({ message: e.message, stack: e.stack });
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
