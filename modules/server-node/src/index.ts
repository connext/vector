import fastify from "fastify";
import {
  createNode,
  IsomorphicNode,
  CreateChannelInput,
  DepositInput,
  CreateTransferInput,
} from "../../isomorphic-node/dist";
import { BigNumber } from "ethers";

import { GenericErrorResponse } from "./helpers/types";
import { Routes } from "./schema";

type StringifyBigNumberAmount<T> = Omit<T, "amount"> & { amount: string };

const server = fastify();

let isoNode: IsomorphicNode;
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

server.post<{ Body: CreateChannelInput }>(
  Routes.post.createChannel.route,
  { schema: Routes.post.createChannel.schema },
  async (request, reply) => {
    const res = await isoNode.createChannel({
      chainId: request.body.chainId,
      publicIdentifier: request.body.publicIdentifier,
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
    const res = await isoNode.deposit({
      amount: BigNumber.from(request.body.amount),
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
    const res = await isoNode.createTransfer({
      amount: BigNumber.from(request.body.amount),
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
