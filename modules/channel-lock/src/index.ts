import fastify from "fastify";
import pino from "pino";

import { MessagingAuthService } from "./auth/messaging-auth-service";
import { config } from "./config";

const logger = pino({
  level: "info",
});

const server = fastify({
  logger,
});

const messagingService = new MessagingAuthService(
  {
    messagingUrl: config.messagingUrl,
    privateKey: config.privateKey,
    publicKey: config.publicKey,
  },
  logger.child({ module: "MessagingAuthService" }),
  config.adminToken,
);

server.get("/ping", async (request, reply) => {
  return "pong\n";
});

server.listen(8080, (err, address) => {
  if (err) {
    console.error(err);
    process.exit(1);
  }
  console.log(`Server listening at ${address}`);
});
