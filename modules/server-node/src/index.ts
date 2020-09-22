import fastify from "fastify";
import fastifyOas from "fastify-oas";
import pino from "pino";
import { VectorEngine } from "@connext/vector-engine";
import { ChannelSigner } from "@connext/vector-utils";
import { Wallet } from "ethers";
import {
  ChannelRpcMethods,
  GetChannelStateParams,
  getChannelStateParamsSchema,
  getChannelStateResponseSchema,
  GetConfigResponseBody,
  getConfigResponseSchema,
  postAdminBodySchema,
  PostAdminRequestBody,
  postAdminResponseSchema,
  postDepositBodySchema,
  PostDepositRequestBody,
  postDepositResponseSchema,
  postLinkedTransferBodySchema,
  PostLinkedTransferRequestBody,
  postLinkedTransferResponseSchema,
  postSetupBodySchema,
  PostSetupRequestBody,
  postSetupResponseSchema,
} from "@connext/vector-types";

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

server.get("/config", { schema: { response: getConfigResponseSchema } }, async (request, reply) => {
  return reply.status(200).send({
    publicIdentifier: signer.publicIdentifier,
    signerAddress: signer.address,
  } as GetConfigResponseBody);
});

server.get<{ Params: GetChannelStateParams }>(
  "/channel/:channelAddress",
  { schema: { params: getChannelStateParamsSchema, response: getChannelStateResponseSchema } },
  async (request, reply) => {
    const params = constructRpcRequest(ChannelRpcMethods.chan_getChannelState, request.params.channelAddress);
    try {
      const res = await vectorEngine.request(params);
      if (!res) {
        return reply.status(404).send({ message: "Channel not found", channelAddress: request.params.channelAddress });
      }
      return reply.status(200).send(res);
    } catch (e) {}
  },
);

server.post<{ Body: PostSetupRequestBody }>(
  "/setup",
  { schema: { body: postSetupBodySchema, response: postSetupResponseSchema } },
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

server.post<{ Body: PostDepositRequestBody }>(
  "/deposit",
  { schema: { body: postDepositBodySchema, response: postDepositResponseSchema } },
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
    await depositRes.getValue().wait();
    const res = await vectorEngine.deposit({
      amount: request.body.amount,
      assetId: request.body.assetId,
      channelAddress: request.body.channelAddress,
    });
    if (res.isError) {
      return reply.status(400).send({ message: res.getError()!.message ?? "" });
    }
    return reply.status(200).send(res.getValue());
  },
);

server.post<{ Body: PostLinkedTransferRequestBody }>(
  "/linked-transfer",
  { schema: { body: postLinkedTransferBodySchema, response: postLinkedTransferResponseSchema } },
  async (request, reply) => {
    const res = await vectorEngine.conditionalTransfer({
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

server.post<{ Body: PostAdminRequestBody }>(
  "/clear-store",
  { schema: { body: postAdminBodySchema, response: postAdminResponseSchema } },
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
