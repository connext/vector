import "core-js/stable";
import "regenerator-runtime/runtime";
import fastify from "fastify";
import fastifyCors from "fastify-cors";
import pino from "pino";

import { config } from "./config";
import { NatsMetricsMessagingService, getRandomChannelSigner } from "@connext/vector-utils";

export const logger = pino({ name: "metrics-collector" });
logger.info("Starting metrics-collector");

const subscribeCallback = async (msg: string) => {
  console.log(msg);
}

const server = fastify({ logger, pluginTimeout: 300_000 });
server.register(fastifyCors, {
  origin: "*",
  methods: ["GET", "PUT", "POST", "OPTIONS"],
  preflightContinue: true,
});

server.addHook("onReady", async () => {
  const messagingService = new NatsMetricsMessagingService(
    {
      messagingUrl: config.messagingUrl!,
      logger: logger.child({
        module: "Nats metrics messaging service"
      }),
      signer: getRandomChannelSigner()
    }
  );
  await messagingService.connect();
  await messagingService.subscribeMetrics(subscribeCallback);
});

server.get("/ping", async () => {
  return "pong\n";
});

server.listen(8000, "0.0.0.0", (err, address) => {
  if (err) {
    logger.error(err);
    process.exit(1);
  }
  logger.info(`Server listening at ${address}`);
});
