# Events

To subscribe to the `server-node`'s event emitter, the JS client uses webhooks. A program that wants to listen for the `server-node`'s events needs to implement an HTTP server that can accept POST requests which the `server-node` POSTs to when events are generated. The JS client uses a mapping of [EVTs](https://www.evt.land) which should be posted to when the HTTP request is received to allow for more powerful filtering capabilities behind an easy to use interface.

A full example can be found in the implementation of the [router module](./modules/router/src), here are relevant snippets:

```ts
import { Evt } from "evt";
import fastify from "fastify";
import { RestServerNodeService } from "@connext/vector-utils";
import {
  ConditionalTransferCreatedPayload,
  ConditionalTransferResolvedPayload,
  EngineEvents,
} from "@connext/vector-types";

// using fastify as the web server
const server = fastify();

// configure event subscriptions
const serverBase = `http://localhost:3000`; // this server
// callback paths
const conditionalTransferCreatedPath = "/conditional-transfer-created";
const conditionalTransferResolvedPath = "/conditional-transfer-resolved";
const evts = {
  [EngineEvents.CONDITIONAL_TRANSFER_CREATED]: {
    evt: Evt.create<ConditionalTransferCreatedPayload>(),
    url: `${routerBase}${conditionalTransferCreatedPath}`,
  },
  [EngineEvents.CONDITIONAL_TRANSFER_RESOLVED]: {
    evt: Evt.create<ConditionalTransferResolvedPayload>(),
    url: `${routerBase}${conditionalTransferResolvedPath}`,
  },
  [EngineEvents.SETUP]: {},
  [EngineEvents.WITHDRAWAL_CREATED]: {},
  [EngineEvents.WITHDRAWAL_RESOLVED]: {},
  [EngineEvents.WITHDRAWAL_RECONCILED]: {},
  [EngineEvents.DEPOSIT_RECONCILED]: {},
};

const logger = pino();
let node: RestServerNodeService | undefined;
server.addHook("onReady", async () => {
  // asynchronously connect to server node
  node = await RestServerNodeService.connect(
    "http://localhost:8001",
    { 1337: "http://localhost:8545" },
    logger.child({ module: "RestServerNodeService" }), // namespace logs by module
    evts, // event subscription config
  );
});

// endpoints to receive server-node events
server.post(conditionalTransferCreatedPath, async (request, response) => {
  // post to the EVT that we pass into the server-node client
  evts[EngineEvents.CONDITIONAL_TRANSFER_CREATED].post(request.body as ConditionalTransferCreatedPayload);
  return response.status(200).send({ message: "success" });
});

server.post(conditionalTransferResolvedPath, async (request, response) => {
  evts[EngineEvents.CONDITIONAL_TRANSFER_RESOLVED].post(request.body as ConditionalTransferResolvedPayload);
  return response.status(200).send({ message: "success" });
});

await node.on(
  EngineEvents.CONDITIONAL_TRANSFER_CREATED,
  async data => {
    console.log(`Received conditional transfer: ${JSON.stringify(data)}`);
  },
  data => data.transfer.initiator === "indraABCD", // can filter on the data here
);
```