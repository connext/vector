import fastify from "fastify";
import pino from "pino";
import { NodeCore } from "@connext/vector-node-core";
import { ChannelSigner } from "@connext/vector-utils";
import { Wallet } from "ethers";
import axios from "axios";

import { NatsMessagingService } from "./services/messaging";
import { LockService } from "./services/lock";
import { PrismaStore } from "./services/store";
import { config } from "./config";
import { SetupBodySchema as ISetupBodySchema } from "./generated-types/setup/body";
import SetupBodySchema from "./schemas/setup/body.json";
import { DepositBodySchema as IDepositBodySchema } from "./generated-types/deposit/body";
import DepositBodySchema from "./schemas/deposit/body.json";
import { LinkedTransferBodySchema as ILinkedTransferBodySchema } from "./generated-types/linkedTransfer/body";
import LinkedTransferBodySchema from "./schemas/linkedTransfer/body.json";

const server = fastify();

const logger = pino();
let vectorNode: NodeCore;
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
  vectorNode = await NodeCore.connect(
    messaging,
    new LockService(config.redisUrl),
    new PrismaStore(),
    signer,
    config.chainProviders,
    {},
    logger.child({ module: "NodeCore" }),
  );
});

server.get("/ping", async () => {
  return "pong\n";
});

server.post<{ Body: ISetupBodySchema }>("/setup", { schema: { body: SetupBodySchema } }, async (request, reply) => {
  const res = await vectorNode.setup({
    counterpartyIdentifier: request.body.counterpartyIdentifier,
    timeout: request.body.timeout,
    chainId: request.body.chainId,
  });
  if (res.isError) {
    return reply.status(400).send({ message: res.getError()?.message ?? "" });
  }
  return reply.status(200).send(res.getValue());
});

server.post<{ Body: IDepositBodySchema }>(
  "/deposit",
  { schema: { body: DepositBodySchema } },
  async (request, reply) => {
    // TODO: Fix isoNode!
    const res = await vectorNode.deposit({
      amount: request.body.amount,
      assetId: request.body.assetId,
      channelAddress: request.body.channelId,
    });
    if (res.isError) {
      return reply.status(400).send({ message: res.getError()?.message ?? "" });
    }
    return reply.status(200).send(res.getValue());
  },
);

server.post<{ Body: ILinkedTransferBodySchema }>(
  "/linked-transfer",
  { schema: { body: LinkedTransferBodySchema } },
  async (request, reply) => {
    const res = await vectorNode.conditionalTransfer({
      amount: request.body.amount,
      assetId: request.body.assetId,
      channelAddress: request.body.channelId,
      paymentId: request.body.paymentId,
      meta: request.body.meta,
      recipient: request.body.recipient,
      conditionType: "LinkedTransfer",
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

server.listen(config.port, (err, address) => {
  if (err) {
    console.error(err);
    process.exit(1);
  }
  console.log(`Server listening at ${address}`);
});
