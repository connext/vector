import fastify from "fastify";
import fastifyOas from "fastify-oas";
import pino from "pino";
import { Evt } from "evt";
import { RestServerNodeService } from "@connext/vector-utils";

import { config } from "./config";
import { IRouter, Router } from "./router";
import { RouterStore } from "./services/store";

const conditionalTransferEvt = Evt.create<any>();

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
  const node = await RestServerNodeService.connect(
    config.serverNodeUrl,
    "http://router:8008",
    config.chainProviders,
    conditionalTransferEvt,
    logger.child({ module: "RestServerNodeService" }),
  );
  router = await Router.connect(node, store, logger);
});

server.get("/ping", async () => {
  return "pong\n";
});

server.post("/conditional-transfer-created", async (request, response) => {
  console.log("request: ", request.body);
  conditionalTransferEvt.post(request.body);
  return response.status(200).send({ message: "success" });
});

server.listen(config.port, "0.0.0.0", (err, address) => {
  if (err) {
    console.error(err);
    process.exit(1);
  }
  console.log(`Server listening at ${address}`);
});
