import fastify from "fastify";
import fastifyOas from "fastify-oas";
import pino from "pino";
import { VectorEngine } from "@connext/vector-engine";
import { ChannelSigner } from "@connext/vector-utils";
import { Wallet } from "ethers";
import { ChannelRpcMethods, ServerNodeParams, ServerNodeResponses } from "@connext/vector-types";

import { getBearerTokenFunction, NatsMessagingService } from "./services/messaging";
import { LockService } from "./services/lock";
import { PrismaStore } from "./services/store";
import { config } from "./config";
import { MultichainTransactionService, VectorTransactionService } from "./services/onchain";
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

const multichainTx = new MultichainTransactionService(config.chainProviders, pk);
const vectorTx = new VectorTransactionService(multichainTx, logger.child({ module: "VectorTransactionService" }));
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
      const res = await vectorEngine.request(params);
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

server.get("/channel", { schema: { response: ServerNodeResponses.GetChannelStatesSchema } }, async (request, reply) => {
  const params = constructRpcRequest(ChannelRpcMethods.chan_getChannelStates, undefined);
  try {
    const res = await vectorEngine.request<"chan_getChannelStates">(params);
    return reply.status(200).send(res.map((chan) => chan.channelAddress));
  } catch (e) {
    logger.error({ message: e.message, stack: e.stack });
    return reply.status(500).send({ message: e.message });
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
      const res = await vectorEngine.request(rpc);
      return reply.status(200).send(res);
    } catch (e) {
      logger.error({ message: e.message, stack: e.stack });
      return reply.status(500).send({ message: e.message });
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
      return reply.status(400).send({ message: depositRes.getError()!.message ?? "" });
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
      const res = await vectorEngine.request(rpc);
      return reply.status(200).send(res);
    } catch (e) {
      logger.error({ message: e.message, stack: e.stack });
      return reply.status(500).send({ message: e.message });
    }
  },
);

server.post<{ Body: ServerNodeParams.LinkedTransfer }>(
  "/linked-transfer",
  { schema: { body: ServerNodeParams.LinkedTransferSchema, response: ServerNodeResponses.LinkedTransferSchema } },
  async (request, reply) => {
    const rpc = constructRpcRequest(ChannelRpcMethods.chan_createTransfer, {
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
    } as any);
    try {
      const res = await vectorEngine.request(rpc);
      return reply.status(200).send(res);
    } catch (e) {
      logger.error({ message: e.message, stack: e.stack });
      return reply.status(500).send({ message: e.message });
    }
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
