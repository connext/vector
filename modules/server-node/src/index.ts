import fastify from "fastify";
import fastifyOas from "fastify-oas";
import pino from "pino";
import { VectorEngine } from "@connext/vector-engine";
import { ChannelSigner } from "@connext/vector-utils";
import { Wallet } from "ethers";
import axios from "axios";

import { NatsMessagingService } from "./services/messaging";
import { LockService } from "./services/lock";
import { PrismaStore } from "./services/store";
import { config } from "./config";
import {
  postDepositBodySchema,
  PostDepositRequestBody,
  postDepositResponseSchema,
  postLinkedTransferBodySchema,
  PostLinkedTransferRequestBody,
  postLinkedTransferResponseSchema,
  postSetupBodySchema,
  PostSetupRequestBody,
  postSetupResponseSchema,
} from "./schema";

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
let vectorNode: VectorEngine;
const signer = new ChannelSigner(Wallet.fromMnemonic(config.mnemonic!).privateKey);
server.addHook("onReady", async () => {
  const messaging = new NatsMessagingService(
    {
      messagingUrl: config.natsUrl,
    },
    logger.child({ module: "NatsMessagingService" }),
    async () => {
      const r = await axios.get(`${config.authUrl}/auth/${signer.publicIdentifier}`);
      return r.data;
    },
  );
  await messaging.connect();
  vectorNode = await VectorEngine.connect(
    messaging,
    new LockService(config.redisUrl),
    new PrismaStore(),
    signer,
    config.chainProviders,
    {},
    logger.child({ module: "VectorEngine" }),
  );
});

server.get("/ping", async () => {
  return "pong\n";
});

server.post<{ Body: PostSetupRequestBody }>(
  "/setup",
  { schema: { body: postSetupBodySchema, response: postSetupResponseSchema } },
  async (request, reply) => {
    const res = await vectorNode.setup({
      counterpartyIdentifier: request.body.counterpartyIdentifier,
      timeout: request.body.timeout,
      chainId: request.body.chainId,
    });
    if (res.isError) {
      return reply.status(400).send({ message: res.getError()?.message ?? "" });
    }
    return reply.status(200).send(res.getValue());
  },
);

server.post<{ Body: PostDepositRequestBody }>(
  "/deposit",
  { schema: { body: postDepositBodySchema, response: postDepositResponseSchema } },
  async (request, reply) => {
    const res = await vectorNode.deposit({
      amount: request.body.amount,
      assetId: request.body.assetId,
      channelAddress: request.body.channelAddress,
    });
    if (res.isError) {
      return reply.status(400).send({ message: res.getError()?.message ?? "" });
    }
    return reply.status(200).send(res.getValue());
  },
);

server.post<{ Body: PostLinkedTransferRequestBody }>(
  "/linked-transfer",
  { schema: { body: postLinkedTransferBodySchema, response: postLinkedTransferResponseSchema } },
  async (request, reply) => {
    const res = await vectorNode.conditionalTransfer({
      amount: request.body.amount,
      assetId: request.body.assetId,
      channelAddress: request.body.channelAddress,
      conditionType: "LinkedTransfer",
      meta: request.body.meta,
      recipient: request.body.recipient,
      routingId: request.body.routingId,
      details: {
        preImage: request.body.preImage,
      },
    });
    if (res.isError) {
      return reply.status(400).send({ message: res.getError()?.message ?? "" });
    }
    return reply.status(200).send(res.getValue());
  },
);

server.listen(config.port, "0.0.0.0", (err, address) => {
  if (err) {
    console.error(err);
    process.exit(1);
  }
  console.log(`Server listening at ${address}`);
});
