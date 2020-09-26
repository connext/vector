import fastify from "fastify";
import fastifyOas from "fastify-oas";
import pino from "pino";

import { config } from "./config";
import { IRouter, Router } from "./router";
import { RestServerNodeService } from "./services/server-node";
import { RouterStore } from "./services/store";

const server = fastify();
server.register(fastifyOas, {
  swagger: {
    info: {
      title: "Vector Server-Node",
      version: "0.0.1",
    },
  },
  exposeRoute: true,
});

const logger = pino();
let router: IRouter;
const store = new RouterStore();
server.addHook("onReady", async () => {
  const node = await RestServerNodeService.connect(config.serverNodeUrl, config.chainProviders);
  router = await Router.connect(node, store, logger);
});

server.get("/ping", async () => {
  return "pong\n";
});

server.listen(config.port, "0.0.0.0", (err, address) => {
  if (err) {
    console.error(err);
    process.exit(1);
  }
  console.log(`Server listening at ${address}`);
});
