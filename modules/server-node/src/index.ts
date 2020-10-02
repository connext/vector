import fastify from "fastify";
import fastifyOas from "fastify-oas";
import pino from "pino";
import { VectorEngine } from "@connext/vector-engine";
import { ChannelSigner } from "@connext/vector-utils";
import { providers, Wallet } from "ethers";
import {
  ChannelRpcMethods,
  EngineEvent,
  EngineEvents,
  ChainError,
  ServerNodeParams,
  ServerNodeResponses,
  ResolveUpdateDetails,
  ILockService,
} from "@connext/vector-types";

import { PrismaStore } from "./services/store";
import { config } from "./config";
import { constructRpcRequest } from "./helpers/rpc";
import { createNode } from "./helpers/nodes";

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

export const logger = pino();
export let lock: ILockService;
export const store = new PrismaStore();

export const _providers = Object.fromEntries(
  Object.entries(config.chainProviders).map(([chainId, url]: any) => [chainId, new providers.JsonRpcProvider(url)]),
);

server.addHook("onReady", async () => {
  await createNode("0");
});

server.get("/ping", async () => {
  return "pong\n";
});

server.get("/config/:index", { schema: { response: ServerNodeResponses.GetConfigSchema } }, async (request, reply) => {
  if (!request.params.index) {
  }
  return reply.status(200).send({
    publicIdentifier: signer.publicIdentifier,
    signerAddress: signer.address,
  } as ServerNodeResponses.GetConfig);
});

server.get<{ Params: ServerNodeParams.GetChannelState }>(
  "/channel/:channelAddress",
  { schema: { params: ServerNodeParams.GetChannelStateSchema } },
  async (request, reply) => {
    const params = constructRpcRequest(ChannelRpcMethods.chan_getChannelState, request.params);
    try {
      const res = await vectorEngine.request<"chan_getChannelState">(params);
      if (!res) {
        return reply.status(404).send({ message: "Channel not found", channelAddress: request.params.channelAddress });
      }
      return reply.status(200).send(res);
    } catch (e) {
      logger.error({ message: e.message, stack: e.stack });
      return reply.status(500).send({ message: e.message });
    }
  },
);

server.get<{ Params: ServerNodeParams.GetChannelStateByParticipants }>(
  "/channel/:alice/:bob/:chainId",
  { schema: { params: ServerNodeParams.GetChannelStateByParticipantsSchema } },
  async (request, reply) => {
    const params = constructRpcRequest(ChannelRpcMethods.chan_getChannelStateByParticipants, request.params);
    try {
      const res = await vectorEngine.request<"chan_getChannelStateByParticipants">(params);
      if (!res) {
        return reply.status(404).send({ message: "Channel not found", alice: request.params });
      }
      return reply.status(200).send(res);
    } catch (e) {
      logger.error({ message: e.message, stack: e.stack });
      return reply.status(500).send({ message: e.message });
    }
  },
);

server.get<{ Params: ServerNodeParams.GetTransferStateByRoutingId }>(
  "/channel/:channelAddress/transfer/:routingId",
  { schema: { params: ServerNodeParams.GetTransferStateByRoutingIdSchema } },
  async (request, reply) => {
    const params = constructRpcRequest(ChannelRpcMethods.chan_getTransferStateByRoutingId, request.params);
    try {
      const res = await vectorEngine.request<"chan_getTransferStateByRoutingId">(params);
      if (!res) {
        return reply.status(404).send({ message: "Transfer not found", params: request.params });
      }
      return reply.status(200).send(res);
    } catch (e) {
      logger.error({ message: e.message, stack: e.stack });
      return reply.status(500).send({ message: e.message });
    }
  },
);

server.get<{ Params: ServerNodeParams.GetTransferStateByRoutingId }>(
  "/transfer/:routingId",
  { schema: { params: ServerNodeParams.GetTransferStatesByRoutingIdSchema } },
  async (request, reply) => {
    const params = constructRpcRequest(ChannelRpcMethods.chan_getTransferStatesByRoutingId, request.params);
    try {
      const res = await vectorEngine.request<"chan_getTransferStatesByRoutingId">(params);
      if (!res) {
        return reply.status(404).send({ message: "Transfer not found", params: request.params });
      }
      return reply.status(200).send(res);
    } catch (e) {
      logger.error({ message: e.message, stack: e.stack });
      return reply.status(500).send({ message: e.message });
    }
  },
);

server.get("/channel", { schema: { response: ServerNodeResponses.GetChannelStatesSchema } }, async (request, reply) => {
  const params = constructRpcRequest(ChannelRpcMethods.chan_getChannelStates, undefined);
  try {
    const res = await vectorEngine.request<"chan_getChannelStates">(params);
    return reply.status(200).send(res.map(chan => chan.channelAddress));
  } catch (e) {
    logger.error({ message: e.message, stack: e.stack, context: e.context });
    return reply.status(500).send({ message: e.message, context: e.context });
  }
});

server.post<{ Body: ServerNodeParams.Setup }>(
  "/setup",
  { schema: { body: ServerNodeParams.SetupSchema, response: ServerNodeResponses.SetupSchema } },
  async (request, reply) => {
    const rpc = constructRpcRequest(ChannelRpcMethods.chan_setup, {
      chainId: request.body.chainId,
      counterpartyIdentifier: request.body.counterpartyIdentifier,
      timeout: request.body.timeout,
    });
    try {
      const res = await vectorEngine.request<"chan_setup">(rpc);
      return reply.status(200).send(res);
    } catch (e) {
      logger.error({ message: e.message, stack: e.stack, context: e.context });
      return reply.status(500).send({ message: e.message, context: e.context });
    }
  },
);

server.post<{ Body: ServerNodeParams.SendDepositTx }>(
  "/send-deposit-tx",
  { schema: { body: ServerNodeParams.SendDepositTxSchema, response: ServerNodeResponses.SendDepositTxSchema } },
  async (request, reply) => {
    const channelState = await store.getChannelState(request.body.channelAddress);
    if (!channelState) {
      return reply.status(404).send({ message: "Channel not found" });
    }
    const depositRes = await vectorTx.sendDepositTx(
      channelState,
      signer.address,
      request.body.amount,
      request.body.assetId,
    );
    if (depositRes.isError) {
      if (depositRes.getError()!.message === ChainError.reasons.NotEnoughFunds) {
        return reply.status(400).send({ message: depositRes.getError()!.message });
      }
      return reply.status(500).send({ message: depositRes.getError()!.message.substring(0, 100) });
    }
    return reply.status(200).send({ txHash: depositRes.getValue().hash });
  },
);

server.post<{ Body: ServerNodeParams.Deposit }>(
  "/deposit",
  { schema: { body: ServerNodeParams.DepositSchema, response: ServerNodeResponses.DepositSchema } },
  async (request, reply) => {
    const rpc = constructRpcRequest(ChannelRpcMethods.chan_deposit, {
      assetId: request.body.assetId,
      channelAddress: request.body.channelAddress,
    });
    try {
      const res = await vectorEngine.request<"chan_deposit">(rpc);
      return reply.status(200).send(res);
    } catch (e) {
      logger.error({ message: e.message, stack: e.stack, context: e.context });
      return reply.status(500).send({ message: e.message, context: e.context });
    }
  },
);

server.post<{ Body: ServerNodeParams.ConditionalTransfer }>(
  "/linked-transfer/create",
  {
    schema: {
      body: ServerNodeParams.ConditionalTransferSchema,
      response: ServerNodeResponses.ConditionalTransferSchema,
    },
  },
  async (request, reply) => {
    const rpc = constructRpcRequest(ChannelRpcMethods.chan_createTransfer, request.body);
    try {
      const res = await vectorEngine.request<"chan_createTransfer">(rpc);
      return reply.status(200).send({
        channelAddress: res.channelAddress,
        transferId: res.latestUpdate.details.transferId,
      } as ServerNodeResponses.ConditionalTransfer);
    } catch (e) {
      logger.error({ message: e.message, stack: e.stack, context: e.context });
      return reply.status(500).send({ message: e.message, context: e.context });
    }
  },
);

server.post<{ Body: ServerNodeParams.ResolveTransfer }>(
  "/linked-transfer/resolve",
  {
    schema: {
      body: ServerNodeParams.ResolveTransferSchema,
      response: ServerNodeResponses.ResolveTransferSchema,
    },
  },
  async (request, reply) => {
    const rpc = constructRpcRequest(ChannelRpcMethods.chan_resolveTransfer, request.body);
    try {
      const res = await vectorEngine.request<"chan_resolveTransfer">(rpc);
      return reply.status(200).send({
        channelAddress: res.channelAddress,
        transferId: (res.latestUpdate.details as ResolveUpdateDetails).transferId,
      } as ServerNodeResponses.ResolveTransfer);
    } catch (e) {
      logger.error({ message: e.message, stack: e.stack, context: e.context });
      return reply.status(500).send({ message: e.message, context: e.context });
    }
  },
);

server.post<{ Body: ServerNodeParams.Withdraw }>(
  "/withdraw",
  {
    schema: {
      body: ServerNodeParams.WithdrawSchema,
      response: ServerNodeResponses.WithdrawSchema,
    },
  },
  async (request, reply) => {
    const rpc = constructRpcRequest(ChannelRpcMethods.chan_withdraw, request.body);
    try {
      const { channel, transactionHash } = await vectorEngine.request<typeof ChannelRpcMethods.chan_withdraw>(rpc);
      return reply.status(200).send({
        channelAddress: channel.channelAddress,
        transferId: (channel.latestUpdate.details as ResolveUpdateDetails).transferId,
        transactionHash,
      } as ServerNodeResponses.Withdraw);
    } catch (e) {
      logger.error({ message: e.message, stack: e.stack, context: e.context });
      return reply.status(500).send({ message: e.message, context: e.context });
    }
  },
);

server.post<{ Body: ServerNodeParams.RegisterListener }>(
  "/event/subscribe",
  {
    schema: {
      body: ServerNodeParams.RegisterListenerSchema,
      response: ServerNodeResponses.RegisterListenerSchema,
    },
  },
  async (request, reply) => {
    try {
      await Promise.all(
        Object.entries(request.body).map(([eventName, url]) =>
          store.registerSubscription(eventName as EngineEvent, url as string),
        ),
      );
      logger.info({ endpoint: "/event/subscribe", body: request.body }, "Successfully set up subscriptions");
      return reply.status(200).send({ message: "success" });
    } catch (e) {
      return reply.status(500).send({ message: e.message });
    }
  },
);

server.get<{ Params: ServerNodeParams.GetListener }>(
  "/event/:eventName",
  {
    schema: {
      params: ServerNodeParams.GetListenerSchema,
      response: ServerNodeResponses.GetListenerSchema,
    },
  },
  async (request, reply) => {
    const url = await store.getSubscription(request.params.eventName as EngineEvent);
    if (!url) {
      return reply.status(404).send({ message: "Subscription URL not found" });
    }
    return reply.status(200).send({ url });
  },
);

server.get(
  "/event",
  {
    schema: {
      response: ServerNodeResponses.GetListenersSchema,
    },
  },
  async (request, reply) => {
    const subs = await store.getSubscriptions();
    return reply.status(200).send(subs);
  },
);

server.post<{ Body: ServerNodeParams.Admin }>(
  "/clear-store",
  { schema: { body: ServerNodeParams.AdminSchema, response: ServerNodeResponses.AdminSchema } },
  async (request, reply) => {
    if (request.body.adminToken !== config.adminToken) {
      return reply.status(401).send({ message: "Unauthorized" });
    }
    try {
      await store.clear();
      return reply.status(200).send({ message: "success" });
    } catch (e) {
      return reply.status(500).send({ message: e.message });
    }
  },
);

server.post("/node/:index", {}, async (request, reply) => {});

server.listen(config.port, "0.0.0.0", (err, address) => {
  if (err) {
    console.error(err);
    process.exit(1);
  }
  console.log(`Server listening at ${address}`);
});
