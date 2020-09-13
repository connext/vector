import fastify from "fastify";
import pino from "pino";
import { NodeCore } from "@connext/vector-node-core";
import { DepositInput, CreateTransferInput } from "@connext/vector-types";
import { ChannelSigner } from "@connext/vector-utils";
import { Wallet } from "ethers";

import { SetupInput, GenericErrorResponse } from "./types";
import { Routes } from "./schema";
import { TempNatsMessagingService } from "./services/messaging";
import { LockService } from "./services/lock";
import { PrismaStore } from "./services/store";
import { config } from "./config";

type StringifyBigNumberAmount<T> = Omit<T, "amount"> & { amount: string };

const server = fastify();

let vectorEngine: NodeCore;
const signer = new ChannelSigner(Wallet.fromMnemonic(config.mnemonic!).privateKey);
server.addHook("onReady", async () => {
  const messaging = new TempNatsMessagingService("nats://localhost:4222");
  await messaging.connect();
  vectorEngine = await NodeCore.connect(
    messaging,
    new LockService(),
    new PrismaStore(),
    signer,
    config.chainProviders,
    {},
    pino(),
  );
});

server.get("/ping", async (request, reply) => {
  return "pong\n";
});

// isAlive NATS

server.post<{ Body: SetupInput }>(
  Routes.post.setup.route,
  { schema: Routes.post.setup.schema },
  async (request, reply) => {
    request.body.counterpartyIdentifier;
    const res = await vectorEngine.setup({
      counterpartyIdentifier: request.body.counterpartyIdentifier,
      // TODO: fix casting
      networkContext: (request.body as any).networkContext,
      timeout: request.body.timeout,
    });
    if (res.isError) {
      return reply.status(400).send<GenericErrorResponse>({ message: res.getError()?.message ?? "" });
    }
    return reply.status(200).send(res.getValue());
  },
);

server.post<{ Body: StringifyBigNumberAmount<DepositInput> }>(
  Routes.post.deposit.route,
  { schema: Routes.post.deposit.schema },
  async (request, reply) => {
    // TODO: Fix isoNode!
    const isoNode = {} as any;
    const res = await isoNode.deposit({
      amount: request.body.amount,
      assetId: request.body.assetId,
      channelId: request.body.channelId,
    });
    if (res.isError) {
      return reply.status(400).send<GenericErrorResponse>({ message: res.getError()?.message ?? "" });
    }
    return reply.status(200).send(res.getValue());
  },
);

server.post<{ Body: StringifyBigNumberAmount<CreateTransferInput> }>(
  Routes.post.createTransfer.route,
  { schema: Routes.post.deposit.schema },
  async (request, reply) => {
    // TODO: Fix isoNode!
    const isoNode = {} as any;
    const res = await isoNode.createTransfer({
      amount: request.body.amount,
      assetId: request.body.assetId,
      channelId: request.body.channelId,
      paymentId: request.body.paymentId,
      preImage: request.body.preImage,
      meta: request.body.meta,
      recipient: request.body.recipient,
    });
    if (res.isError) {
      return reply.status(400).send<GenericErrorResponse>({ message: res.getError()?.message ?? "" });
    }
    return reply.status(200).send(res.getValue());
  },
);

server.listen(8080, (err, address) => {
  if (err) {
    console.error(err);
    process.exit(1);
  }
  console.log(`Server listening at ${address}`);
});
