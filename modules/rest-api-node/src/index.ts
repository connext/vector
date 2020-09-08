import fastify from "fastify";
import { createNode } from "@connext/isomorphic-node";

const server = fastify();

let isoNode;
server.addHook("onReady", async () => {
  isoNode = await createNode();
  const res = await isoNode.createChannel({ chainId: 1, publicIdentifier: "blah" });
  if (res.isError) {
    throw res.getError();
  }
  res.getValue();
});

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
