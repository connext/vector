import fastify from "fastify";
import pino from "pino";

import { MessagingAuthService } from "./auth/messaging-auth-service";
import { config } from "./config";
import GetAuthParamsSchema from "./schemas/getNonce/params.json";
import { GetAuthParamsSchema as GetAuthParamsSchemaInterface } from "./types/getNonce/params";
import PostAuthBodySchema from "./schemas/postAuth/body.json";
import { PostAuthBodySchema as PostAuthBodySchemaInterface } from "./types/postAuth/body";

const logger = pino({
  level: "info",
});

const server = fastify({
  logger,
});

const messagingService = new MessagingAuthService(
  {
    messagingUrl: config.messagingUrl,
    privateKey: config.privateKey!,
    publicKey: config.publicKey!,
  },
  logger.child({ module: "MessagingAuthService" }),
  config.adminToken,
);

server.get("/ping", async () => {
  return "pong\n";
});

server.get<{ Params: GetAuthParamsSchemaInterface }>(
  "/auth/:userIdentifier",
  { schema: { params: GetAuthParamsSchema } },
  async (request, reply) => {
    const nonce = await messagingService.getNonce(request.params.userIdentifier);
    return reply.status(200).send(nonce);
  },
);

server.post<{ Body: PostAuthBodySchemaInterface }>(
  "/auth",
  { schema: { body: PostAuthBodySchema } },
  async (request, reply) => {
    const nonce = await messagingService.verifyAndVend(
      request.body.sig,
      request.body.userIdentifier,
      request.body.adminToken,
    );
    return reply.status(200).send(nonce);
  },
);

server.listen(config.port, "0.0.0.0", (err) => {
  if (err) {
    console.error(err);
    process.exit(1);
  }
});
