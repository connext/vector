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
  OnchainError,
  ServerNodeParams,
  ServerNodeResponses,
} from "@connext/vector-types";
import Axios from "axios";

import { getBearerTokenFunction, NatsMessagingService } from "./services/messaging";
import { LockService } from "./services/lock";
import { PrismaStore } from "./services/store";
import { config } from "./config";
import { VectorTransactionService } from "./services/onchain";
import { constructRpcRequest } from "./helpers/rpc";

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
let vectorEngine: VectorEngine;
const pk = Wallet.fromMnemonic(config.mnemonic!).privateKey;
const signer = new ChannelSigner(pk);

const _providers: { [chainId: string]: providers.JsonRpcProvider } = {};
Object.entries(config.chainProviders).forEach(([chainId, url]: any) => {
  _providers[chainId] = new providers.JsonRpcProvider(url);
});

const vectorTx = new VectorTransactionService(_providers, pk, logger.child({ module: "VectorTransactionService" }));
const store = new PrismaStore();
server.addHook("onReady", async () => {
  const messaging = new NatsMessagingService(
    {
      messagingUrl: config.natsUrl,
    },
    logger.child({ module: "NatsMessagingService" }),
    getBearerTokenFunction(signer),
  );
  await messaging.connect();

  const lock = await LockService.connect(config.redisUrl);
  vectorEngine = await VectorEngine.connect(
    messaging,
    lock,
    store,
    signer,
    config.chainProviders,
    config.contractAddresses,
    logger.child({ module: "VectorEngine" }),
  );

  vectorEngine.on(EngineEvents.CONDITIONAL_TRANSFER_CREATED, async data => {
    const url = await store.getSubscription(EngineEvents.CONDITIONAL_TRANSFER_CREATED);
    if (url) {
      await Axios.post(url, data);
    }
  });
});

server.get("/ping", async () => {
  return "pong\n";
});

server.get("/config", { schema: { response: ServerNodeResponses.GetConfigSchema } }, async (request, reply) => {
  return reply.status(200).send({
    publicIdentifier: signer.publicIdentifier,
    signerAddress: signer.address,
  } as ServerNodeResponses.GetConfig);
});

server.get<{ Params: ServerNodeParams.GetChannelState }>(
  "/channel/:channelAddress",
  // TODO: add response schema, if you set it as `Any` it doesn't work properly
  //  might want to add the full channel state as a schema
  { schema: { params: ServerNodeParams.GetChannelStateSchema } },
  async (request, reply) => {
    const params = constructRpcRequest(ChannelRpcMethods.chan_getChannelState, request.params.channelAddress);
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
  // TODO: add response schema, if you set it as `Any` it doesn't work properly
  //  might want to add the full channel state as a schema
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
      if (depositRes.getError()!.message === OnchainError.reasons.NotEnoughFunds) {
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
      console.log("deposit res", res);
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
        routingId: request.body.routingId,
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
      } as ServerNodeResponses.ResolveTransfer);
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

server.listen(config.port, "0.0.0.0", (err, address) => {
  if (err) {
    console.error(err);
    process.exit(1);
  }
  console.log(`Server listening at ${address}`);
});
