import "core-js/stable";
import "regenerator-runtime/runtime";
import fastify from "fastify";
import fastifyCors from "fastify-cors";
import pino from "pino";
import {
  ChannelRpcMethods,
  EngineEvent,
  ChainError,
  NodeParams,
  NodeResponses,
  ResolveUpdateDetails,
  CreateUpdateDetails,
  TPublicIdentifier,
  FullChannelState,
  jsonifyError,
} from "@connext/vector-types";
import { constructRpcRequest, getPublicIdentifierFromPublicKey, hydrateProviders } from "@connext/vector-utils";
import { WithdrawCommitment } from "@connext/vector-contracts";
import { Static, Type } from "@sinclair/typebox";
import { Wallet } from "@ethersproject/wallet";

import { PrismaStore } from "./services/store";
import { config } from "./config";
import { createNode, deleteNodes, getChainService, getNode, getNodes } from "./helpers/nodes";
import { ServerNodeError } from "./helpers/errors";

const configuredIdentifier = getPublicIdentifierFromPublicKey(Wallet.fromMnemonic(config.mnemonic).publicKey);
export const logger = pino({ name: configuredIdentifier });
logger.info({ config }, "Loaded config from environment");
const server = fastify({ logger, pluginTimeout: 300_000, disableRequestLogging: config.logLevel !== "debug" });
server.register(fastifyCors, {
  origin: "*",
  methods: ["GET", "PUT", "POST", "OPTIONS"],
  preflightContinue: true,
});

export const store = new PrismaStore();

export const _providers = hydrateProviders(config.chainProviders);

server.addHook("onReady", async () => {
  // get persisted mnemonic
  let storedMnemonic = await store.getMnemonic();
  if (!storedMnemonic) {
    logger.info("No mnemonic found in store, setting mnemonic from config");
    await store.setMnemonic(config.mnemonic);
    storedMnemonic = config.mnemonic;
  }

  const persistedNodes = await store.getNodeIndexes();
  for (const nodeIndex of persistedNodes) {
    logger.info({ node: nodeIndex }, "Rehydrating persisted node");
    await createNode(nodeIndex.index, store, storedMnemonic, config.skipCheckIn ?? false);
  }
});

server.get("/ping", async () => {
  return "pong\n";
});

server.get("/config", { schema: { response: NodeResponses.GetConfigSchema } }, async (request, reply) => {
  const nodes = getNodes();
  return reply.status(200).send(
    nodes.map((node) => {
      return {
        index: node.index,
        publicIdentifier: node.node.publicIdentifier,
        signerAddress: node.node.signerAddress,
      };
    }),
  );
});

server.get<{ Params: { publicIdentifier: string } }>(
  "/:publicIdentifier/status",
  { schema: { params: Type.Object({ publicIdentifier: TPublicIdentifier }) } },
  async (request, reply) => {
    const engine = getNode(request.params.publicIdentifier);
    if (!engine) {
      return reply
        .status(400)
        .send(
          jsonifyError(
            new ServerNodeError(ServerNodeError.reasons.NodeNotFound, request.params.publicIdentifier, request.params),
          ),
        );
    }
    try {
      const params = constructRpcRequest(ChannelRpcMethods.chan_getStatus, {});
      const res = await engine.request<"chan_getStatus">(params);
      return reply.status(200).send(res);
    } catch (e) {
      logger.error({ error: e.toJson() });
      return reply.status(500).send(jsonifyError(e));
    }
  },
);

server.get<{ Params: NodeParams.GetRouterConfig }>(
  "/:publicIdentifier/router/config/:routerIdentifier",
  { schema: { params: NodeParams.GetRouterConfigSchema } },
  async (request, reply) => {
    const engine = getNode(request.params.publicIdentifier);
    if (!engine) {
      return reply
        .status(400)
        .send(
          jsonifyError(
            new ServerNodeError(ServerNodeError.reasons.NodeNotFound, request.params.publicIdentifier, request.params),
          ),
        );
    }
    const params = constructRpcRequest(ChannelRpcMethods.chan_getRouterConfig, request.params);
    try {
      const res = await engine.request<"chan_getRouterConfig">(params);
      return reply.status(200).send(res);
    } catch (e) {
      logger.error({ error: e.toJson() });
      return reply.status(500).send(jsonifyError(e));
    }
  },
);

server.get<{ Params: NodeParams.GetChannelState }>(
  "/:publicIdentifier/channels/:channelAddress",
  { schema: { params: NodeParams.GetChannelStateSchema } },
  async (request, reply) => {
    const engine = getNode(request.params.publicIdentifier);
    if (!engine) {
      return reply
        .status(400)
        .send(
          jsonifyError(
            new ServerNodeError(ServerNodeError.reasons.NodeNotFound, request.params.publicIdentifier, request.params),
          ),
        );
    }

    const params = constructRpcRequest(ChannelRpcMethods.chan_getChannelState, request.params);
    try {
      const res = await engine.request<"chan_getChannelState">(params);
      if (!res) {
        return reply
          .status(404)
          .send(
            jsonifyError(
              new ServerNodeError(
                ServerNodeError.reasons.ChannelNotFound,
                request.params.publicIdentifier,
                request.params,
              ),
            ),
          );
      }
      return reply.status(200).send(res);
    } catch (e) {
      logger.error({ error: e.toJson() });
      return reply.status(500).send(jsonifyError(e));
    }
  },
);

server.get<{ Params: NodeParams.GetChannelStateByParticipants }>(
  "/:publicIdentifier/channels/counterparty/:counterparty/chain-id/:chainId",
  { schema: { params: NodeParams.GetChannelStateByParticipantsSchema } },
  async (request, reply) => {
    const engine = getNode(request.params.publicIdentifier);
    if (!engine) {
      return reply
        .status(400)
        .send(
          jsonifyError(
            new ServerNodeError(ServerNodeError.reasons.NodeNotFound, request.params.publicIdentifier, request.params),
          ),
        );
    }
    const params = constructRpcRequest(ChannelRpcMethods.chan_getChannelStateByParticipants, {
      alice: request.params.publicIdentifier,
      bob: request.params.counterparty,
      chainId: request.params.chainId,
    });
    try {
      const res = await engine.request<"chan_getChannelStateByParticipants">(params);
      if (!res) {
        return reply
          .status(404)
          .send(
            jsonifyError(
              new ServerNodeError(
                ServerNodeError.reasons.ChannelNotFound,
                request.params.publicIdentifier,
                request.params,
              ),
            ),
          );
      }
      return reply.status(200).send(res);
    } catch (e) {
      logger.error({ error: e.toJson() });
      return reply.status(500).send(jsonifyError(e));
    }
  },
);

server.get<{ Params: NodeParams.GetTransferState }>(
  "/:publicIdentifier/transfers/:transferId",
  { schema: { params: NodeParams.GetTransferStateSchema } },
  async (request, reply) => {
    const engine = getNode(request.params.publicIdentifier);
    if (!engine) {
      return reply
        .status(400)
        .send(
          jsonifyError(
            new ServerNodeError(ServerNodeError.reasons.NodeNotFound, request.params.publicIdentifier, request.params),
          ),
        );
    }
    const params = constructRpcRequest(ChannelRpcMethods.chan_getTransferState, request.params);
    try {
      const res = await engine.request<"chan_getTransferState">(params);
      if (!res) {
        return reply
          .status(404)
          .send(
            jsonifyError(
              new ServerNodeError(
                ServerNodeError.reasons.TransferNotFound,
                request.params.publicIdentifier,
                request.params,
              ),
            ),
          );
      }
      return reply.status(200).send(res);
    } catch (e) {
      logger.error({ error: e.toJson() });
      return reply.status(500).send(jsonifyError(e));
    }
  },
);

// find transfers with same routingId across multiple channels
// i.e. to forward transfer resolution
server.get<{ Params: NodeParams.GetTransferStatesByRoutingId }>(
  "/:publicIdentifier/transfers/routing-id/:routingId",
  { schema: { params: NodeParams.GetTransferStatesByRoutingIdSchema } },
  async (request, reply) => {
    const engine = getNode(request.params.publicIdentifier);
    if (!engine) {
      return reply
        .status(400)
        .send(
          jsonifyError(
            new ServerNodeError(ServerNodeError.reasons.NodeNotFound, request.params.publicIdentifier, request.params),
          ),
        );
    }
    const params = constructRpcRequest(ChannelRpcMethods.chan_getTransferStatesByRoutingId, request.params);
    try {
      const res = await engine.request<"chan_getTransferStatesByRoutingId">(params);
      return reply.status(200).send(res);
    } catch (e) {
      logger.error({ error: e.toJson() });
      return reply.status(500).send(jsonifyError(e));
    }
  },
);

server.get<{ Params: NodeParams.GetTransferStateByRoutingId }>(
  "/:publicIdentifier/channels/:channelAddress/transfers/routing-id/:routingId",
  { schema: { params: NodeParams.GetTransferStateByRoutingIdSchema } },
  async (request, reply) => {
    const engine = getNode(request.params.publicIdentifier);
    if (!engine) {
      return reply
        .status(400)
        .send(
          jsonifyError(
            new ServerNodeError(ServerNodeError.reasons.NodeNotFound, request.params.publicIdentifier, request.params),
          ),
        );
    }
    const params = constructRpcRequest(ChannelRpcMethods.chan_getTransferStateByRoutingId, request.params);
    try {
      const res = await engine.request<"chan_getTransferStateByRoutingId">(params);
      if (!res) {
        return reply
          .status(404)
          .send(
            jsonifyError(
              new ServerNodeError(
                ServerNodeError.reasons.TransferNotFound,
                request.params.publicIdentifier,
                request.params,
              ),
            ),
          );
      }
      return reply.status(200).send(res);
    } catch (e) {
      logger.error({ error: e.toJson() });
      return reply.status(500).send(jsonifyError(e));
    }
  },
);

server.get<{ Params: NodeParams.GetActiveTransfersByChannelAddress }>(
  "/:publicIdentifier/channels/:channelAddress/active-transfers",
  { schema: { params: NodeParams.GetActiveTransfersByChannelAddressSchema } },
  async (request, reply) => {
    const engine = getNode(request.params.publicIdentifier);
    if (!engine) {
      return reply
        .status(400)
        .send(
          jsonifyError(
            new ServerNodeError(ServerNodeError.reasons.NodeNotFound, request.params.publicIdentifier, request.params),
          ),
        );
    }
    const params = constructRpcRequest(ChannelRpcMethods.chan_getActiveTransfers, request.params);
    try {
      const res = await engine.request<"chan_getActiveTransfers">(params);
      return reply.status(200).send(res);
    } catch (e) {
      logger.error({ error: e.toJson() });
      return reply.status(500).send(jsonifyError(e));
    }
  },
);

server.get<{ Params: NodeParams.GetChannelStates }>(
  "/:publicIdentifier/channels",
  { schema: { params: NodeParams.GetChannelStatesSchema, response: NodeResponses.GetChannelStatesSchema } },
  async (request, reply) => {
    const engine = getNode(request.params.publicIdentifier);
    if (!engine) {
      return reply
        .status(400)
        .send(
          jsonifyError(
            new ServerNodeError(ServerNodeError.reasons.NodeNotFound, request.params.publicIdentifier, request.params),
          ),
        );
    }
    const params = constructRpcRequest(ChannelRpcMethods.chan_getChannelStates, {});
    try {
      const res = await engine.request<"chan_getChannelStates">(params);
      // OPTIMIZATION: use db query instead of filter
      const filtered = res.filter(
        (chan) =>
          chan.aliceIdentifier === request.params.publicIdentifier ||
          chan.bobIdentifier === request.params.publicIdentifier,
      );
      return reply.status(200).send(filtered.map((chan) => chan.channelAddress));
    } catch (e) {
      logger.error({ error: e.toJson() });
      return reply.status(500).send(jsonifyError(e));
    }
  },
);

server.get<{ Params: NodeParams.GetRegisteredTransfers }>(
  "/:publicIdentifier/registered-transfers/chain-id/:chainId",
  {
    schema: { params: NodeParams.GetRegisteredTransfersSchema, response: NodeResponses.GetRegisteredTransfersSchema },
  },
  async (request, reply) => {
    const engine = getNode(request.params.publicIdentifier);
    if (!engine) {
      return reply
        .status(400)
        .send(
          jsonifyError(
            new ServerNodeError(ServerNodeError.reasons.NodeNotFound, request.params.publicIdentifier, request.params),
          ),
        );
    }
    const params = constructRpcRequest(ChannelRpcMethods.chan_getRegisteredTransfers, {
      chainId: request.params.chainId,
    });
    try {
      const res = await engine.request<"chan_getRegisteredTransfers">(params);
      return reply.status(200).send(res);
    } catch (e) {
      logger.error({ error: e.toJson() });
      return reply.status(500).send(jsonifyError(e));
    }
  },
);

server.post<{ Body: NodeParams.Setup }>(
  "/internal-setup",
  { schema: { body: NodeParams.SetupSchema, response: NodeResponses.SetupSchema } },
  async (request, reply) => {
    const engine = getNode(request.body.publicIdentifier);
    if (!engine) {
      return reply
        .status(400)
        .send(
          jsonifyError(
            new ServerNodeError(ServerNodeError.reasons.NodeNotFound, request.body.publicIdentifier, request.body),
          ),
        );
    }
    const rpc = constructRpcRequest(ChannelRpcMethods.chan_setup, {
      chainId: request.body.chainId,
      counterpartyIdentifier: request.body.counterpartyIdentifier,
      timeout: request.body.timeout,
    });
    try {
      const res = await engine.request<"chan_setup">(rpc);
      return reply.status(200).send(res);
    } catch (e) {
      logger.error({ error: e.toJson() });
      return reply.status(500).send(jsonifyError(e));
    }
  },
);

server.post<{ Body: NodeParams.RequestSetup }>(
  "/setup",
  { schema: { body: NodeParams.RequestSetupSchema, response: NodeResponses.RequestSetupSchema } },
  async (request, reply) => {
    const engine = getNode(request.body.publicIdentifier);
    if (!engine) {
      return reply
        .status(400)
        .send(
          jsonifyError(
            new ServerNodeError(ServerNodeError.reasons.NodeNotFound, request.body.publicIdentifier, request.body),
          ),
        );
    }
    const rpc = constructRpcRequest(ChannelRpcMethods.chan_requestSetup, {
      chainId: request.body.chainId,
      counterpartyIdentifier: request.body.counterpartyIdentifier,
      timeout: request.body.timeout,
    });
    try {
      const result = await engine.request<"chan_requestSetup">(rpc);
      logger.info({ result }, "Request collateral completed");
      return reply.status(200).send({ ...result, channelAddress: result.channelAddress });
    } catch (e) {
      logger.error({ error: e.toJson() });
      return reply.status(500).send(jsonifyError(e));
    }
  },
);

server.post<{ Body: NodeParams.SendDepositTx }>(
  "/send-deposit-tx",
  { schema: { body: NodeParams.SendDepositTxSchema, response: NodeResponses.SendDepositTxSchema } },
  async (request, reply) => {
    const chainService = getChainService(request.body.publicIdentifier);
    const engine = getNode(request.body.publicIdentifier);

    if (!engine || !chainService) {
      return reply
        .status(400)
        .send(
          jsonifyError(
            new ServerNodeError(ServerNodeError.reasons.NodeNotFound, request.body.publicIdentifier, request.body),
          ),
        );
    }

    let channelState: FullChannelState | undefined;
    try {
      channelState = await store.getChannelState(request.body.channelAddress);
    } catch (e) {
      return reply
        .status(500)
        .send(
          jsonifyError(
            new ServerNodeError(ServerNodeError.reasons.GetChannelFailed, request.body.publicIdentifier, request.body),
          ),
        );
    }
    if (!channelState) {
      return reply
        .status(404)
        .send(
          jsonifyError(
            new ServerNodeError(ServerNodeError.reasons.ChannelNotFound, request.body.publicIdentifier, request.body),
          ),
        );
    }
    const depositRes = await chainService.sendDepositTx(
      channelState,
      engine.signerAddress,
      request.body.amount,
      request.body.assetId,
    );
    if (depositRes.isError) {
      if (depositRes.getError()!.message === ChainError.reasons.NotEnoughFunds) {
        return reply.status(400).send({ message: depositRes.getError()!.message });
      }
      logger.error({ error: jsonifyError(depositRes.getError()!) });
      return reply.status(500).send({ message: depositRes.getError()!.message.substring(0, 100) });
    }
    return reply.status(200).send({ txHash: depositRes.getValue().hash });
  },
);

server.post<{ Body: NodeParams.SendDisputeChannelTx }>(
  "/send-dispute-channel-tx",
  {
    schema: {
      body: NodeParams.SendDisputeChannelTxSchema,
      response: NodeResponses.SendDisputeChannelTxSchema,
    },
  },
  async (request, reply) => {
    const engine = getNode(request.body.publicIdentifier);
    if (!engine) {
      return reply
        .status(400)
        .send(
          jsonifyError(
            new ServerNodeError(ServerNodeError.reasons.NodeNotFound, request.body.publicIdentifier, request.body),
          ),
        );
    }

    const rpc = constructRpcRequest(ChannelRpcMethods.chan_dispute, { channelAddress: request.body.channelAddress });

    try {
      const res = await engine.request<typeof ChannelRpcMethods.chan_dispute>(rpc);
      return reply.status(200).send(res);
    } catch (e) {
      logger.error({ error: e.toJson() });
      return reply.status(500).send(jsonifyError(e));
    }
  },
);

server.post<{ Body: NodeParams.SendDefundChannelTx }>(
  "/send-defund-channel-tx",
  {
    schema: {
      body: NodeParams.SendDefundChannelTxSchema,
      response: NodeResponses.SendDefundChannelTxSchema,
    },
  },
  async (request, reply) => {
    const engine = getNode(request.body.publicIdentifier);
    if (!engine) {
      return reply
        .status(400)
        .send(
          jsonifyError(
            new ServerNodeError(ServerNodeError.reasons.NodeNotFound, request.body.publicIdentifier, request.body),
          ),
        );
    }

    const rpc = constructRpcRequest(ChannelRpcMethods.chan_defund, { channelAddress: request.body.channelAddress });

    try {
      const res = await engine.request<typeof ChannelRpcMethods.chan_defund>(rpc);
      return reply.status(200).send(res);
    } catch (e) {
      logger.error({ error: e.toJson() });
      return reply.status(500).send(jsonifyError(e));
    }
  },
);

server.post<{ Body: NodeParams.SendDisputeTransferTx }>(
  "/send-dispute-transfer-tx",
  {
    schema: {
      body: NodeParams.SendDisputeTransferTxSchema,
      response: NodeResponses.SendDisputeTransferTxSchema,
    },
  },
  async (request, reply) => {
    const engine = getNode(request.body.publicIdentifier);
    if (!engine) {
      return reply
        .status(400)
        .send(
          jsonifyError(
            new ServerNodeError(ServerNodeError.reasons.NodeNotFound, request.body.publicIdentifier, request.body),
          ),
        );
    }

    const rpc = constructRpcRequest(ChannelRpcMethods.chan_disputeTransfer, { transferId: request.body.transferId });

    try {
      const res = await engine.request<typeof ChannelRpcMethods.chan_disputeTransfer>(rpc);
      return reply.status(200).send(res);
    } catch (e) {
      logger.error({ error: e.toJson() });
      return reply.status(500).send(jsonifyError(e));
    }
  },
);

server.post<{ Body: NodeParams.SendDefundTransferTx }>(
  "/send-defund-transfer-tx",
  {
    schema: {
      body: NodeParams.SendDefundTransferTxSchema,
      response: NodeResponses.SendDefundTransferTxSchema,
    },
  },
  async (request, reply) => {
    const engine = getNode(request.body.publicIdentifier);
    if (!engine) {
      return reply
        .status(400)
        .send(
          jsonifyError(
            new ServerNodeError(ServerNodeError.reasons.NodeNotFound, request.body.publicIdentifier, request.body),
          ),
        );
    }

    const rpc = constructRpcRequest(ChannelRpcMethods.chan_defundTransfer, { transferId: request.body.transferId });

    try {
      const res = await engine.request<typeof ChannelRpcMethods.chan_defundTransfer>(rpc);
      return reply.status(200).send(res);
    } catch (e) {
      logger.error({ error: e.toJson() });
      return reply.status(500).send(jsonifyError(e));
    }
  },
);

server.post<{ Body: NodeParams.Deposit }>(
  "/deposit",
  { schema: { body: NodeParams.DepositSchema, response: NodeResponses.DepositSchema } },
  async (request, reply) => {
    const engine = getNode(request.body.publicIdentifier);
    if (!engine) {
      return reply
        .status(400)
        .send(
          jsonifyError(
            new ServerNodeError(ServerNodeError.reasons.NodeNotFound, request.body.publicIdentifier, request.body),
          ),
        );
    }

    const rpc = constructRpcRequest(ChannelRpcMethods.chan_deposit, {
      assetId: request.body.assetId,
      channelAddress: request.body.channelAddress,
    });
    try {
      const res = await engine.request<"chan_deposit">(rpc);
      return reply.status(200).send(res);
    } catch (e) {
      logger.error({ error: e.toJson() });
      return reply.status(500).send(jsonifyError(e));
    }
  },
);

server.post<{ Body: NodeParams.RequestCollateral }>(
  "/request-collateral",
  { schema: { body: NodeParams.RequestCollateralSchema, response: NodeResponses.RequestCollateralSchema } },
  async (request, reply) => {
    const engine = getNode(request.body.publicIdentifier);
    if (!engine) {
      return reply
        .status(400)
        .send(
          jsonifyError(
            new ServerNodeError(ServerNodeError.reasons.NodeNotFound, request.body.publicIdentifier, request.body),
          ),
        );
    }

    const rpc = constructRpcRequest(ChannelRpcMethods.chan_requestCollateral, request.body);
    try {
      const result = await engine.request<"chan_requestCollateral">(rpc);
      logger.info({ result }, "Request collateral completed");
      return reply.status(200).send({ ...result, channelAddress: request.body.channelAddress });
    } catch (e) {
      logger.error({ error: e.toJson() });
      return reply.status(500).send(jsonifyError(e));
    }
  },
);

server.post<{ Body: NodeParams.ConditionalTransfer }>(
  "/transfers/create",
  {
    schema: {
      body: NodeParams.ConditionalTransferSchema,
      response: NodeResponses.ConditionalTransferSchema,
    },
  },
  async (request, reply) => {
    const engine = getNode(request.body.publicIdentifier);
    if (!engine) {
      return reply
        .status(400)
        .send(
          jsonifyError(
            new ServerNodeError(ServerNodeError.reasons.NodeNotFound, request.body.publicIdentifier, request.body),
          ),
        );
    }

    const rpc = constructRpcRequest(ChannelRpcMethods.chan_createTransfer, request.body);
    try {
      const res = await engine.request<"chan_createTransfer">(rpc);
      return reply.status(200).send({
        channelAddress: res.channelAddress,
        transferId: (res.latestUpdate.details as CreateUpdateDetails).transferId,
        routingId: (res.latestUpdate.details as CreateUpdateDetails).meta?.routingId,
      } as NodeResponses.ConditionalTransfer);
    } catch (e) {
      logger.error({ error: e.toJson() });
      return reply.status(500).send(jsonifyError(e));
    }
  },
);

server.post<{ Body: NodeParams.ResolveTransfer }>(
  "/transfers/resolve",
  {
    schema: {
      body: NodeParams.ResolveTransferSchema,
      response: NodeResponses.ResolveTransferSchema,
    },
  },
  async (request, reply) => {
    const engine = getNode(request.body.publicIdentifier);
    if (!engine) {
      return reply
        .status(400)
        .send(
          jsonifyError(
            new ServerNodeError(ServerNodeError.reasons.NodeNotFound, request.body.publicIdentifier, request.body),
          ),
        );
    }
    const rpc = constructRpcRequest(ChannelRpcMethods.chan_resolveTransfer, request.body);
    try {
      const res = await engine.request<"chan_resolveTransfer">(rpc);
      return reply.status(200).send({
        channelAddress: res.channelAddress,
        transferId: (res.latestUpdate.details as ResolveUpdateDetails).transferId,
      } as NodeResponses.ResolveTransfer);
    } catch (e) {
      logger.error({ error: e.toJson() });
      return reply.status(500).send(jsonifyError(e));
    }
  },
);

server.post<{ Body: NodeParams.Withdraw }>(
  "/withdraw",
  {
    schema: {
      body: NodeParams.WithdrawSchema,
      response: NodeResponses.WithdrawSchema,
    },
  },
  async (request, reply) => {
    const engine = getNode(request.body.publicIdentifier);
    if (!engine) {
      return reply
        .status(400)
        .send(
          jsonifyError(
            new ServerNodeError(ServerNodeError.reasons.NodeNotFound, request.body.publicIdentifier, request.body),
          ),
        );
    }
    const rpc = constructRpcRequest(ChannelRpcMethods.chan_withdraw, request.body);
    try {
      const { channel, transactionHash } = await engine.request<typeof ChannelRpcMethods.chan_withdraw>(rpc);
      return reply.status(200).send({
        channelAddress: channel.channelAddress,
        transferId: (channel.latestUpdate.details as ResolveUpdateDetails).transferId,
        transactionHash,
      } as NodeResponses.Withdraw);
    } catch (e) {
      logger.error({ error: e.toJson() });
      return reply.status(500).send(jsonifyError(e));
    }
  },
);

server.post<{ Body: NodeParams.RestoreState }>(
  "/restore",
  { schema: { body: NodeParams.RestoreStateSchema, response: NodeResponses.RestoreStateSchema } },
  async (request, reply) => {
    const engine = getNode(request.body.publicIdentifier);
    if (!engine) {
      return reply
        .status(400)
        .send(
          jsonifyError(
            new ServerNodeError(ServerNodeError.reasons.NodeNotFound, request.body.publicIdentifier, request.body),
          ),
        );
    }
    const rpc = constructRpcRequest(ChannelRpcMethods.chan_restoreState, request.body);
    try {
      const { channelAddress } = await engine.request<typeof ChannelRpcMethods.chan_restoreState>(rpc);
      return reply.status(200).send({ channelAddress } as NodeResponses.RestoreState);
    } catch (e) {
      logger.error({ error: e.toJson() });
      return reply.status(500).send(jsonifyError(e));
    }
  },
);

server.post<{ Body: NodeParams.SendIsAlive }>(
  "/is-alive",
  { schema: { response: NodeResponses.SendIsAliveSchema } },
  async (request, reply) => {
    const engine = getNode(request.body.publicIdentifier);
    if (!engine) {
      return reply
        .status(400)
        .send(
          jsonifyError(
            new ServerNodeError(ServerNodeError.reasons.NodeNotFound, request.body.publicIdentifier, request.body),
          ),
        );
    }
    const rpc = constructRpcRequest(ChannelRpcMethods.chan_sendIsAlive, request.body);
    try {
      const { channelAddress } = await engine.request<typeof ChannelRpcMethods.chan_sendIsAlive>(rpc);
      return reply.status(200).send({ channelAddress } as NodeResponses.SendIsAlive);
    } catch (e) {
      logger.error({ error: e.toJson() });
      return reply.status(500).send(jsonifyError(e));
    }
  },
);

server.post<{ Body: NodeParams.RegisterListener }>(
  "/event/subscribe",
  {
    schema: {
      body: NodeParams.RegisterListenerSchema,
      response: NodeResponses.RegisterListenerSchema,
    },
  },
  async (request, reply) => {
    try {
      for (const [eventName, url] of Object.entries(request.body.events)) {
        try {
          await store.registerSubscription(request.body.publicIdentifier, eventName as EngineEvent, url as string);
        } catch (e) {
          logger.error({ eventName, url, e }, "Error setting up subscription");
          throw e;
        }
      }
      logger.info({ endpoint: "/event/subscribe", body: request.body }, "Successfully set up subscriptions");
      return reply.status(200).send({ message: "success" });
    } catch (e) {
      logger.error(e);
      return reply
        .status(500)
        .send(
          new ServerNodeError(
            ServerNodeError.reasons.RegisterSubscriptionFailed,
            request.body.publicIdentifier,
            request.body,
            { registerError: e.message },
          ).toJson(),
        );
    }
  },
);

server.get<{ Params: NodeParams.GetListener }>(
  "/:publicIdentifier/event/:eventName",
  {
    schema: {
      params: NodeParams.GetListenerSchema,
      response: NodeResponses.GetListenerSchema,
    },
  },
  async (request, reply) => {
    const url = await store.getSubscription(request.params.publicIdentifier, request.params.eventName as EngineEvent);
    if (!url) {
      return reply
        .status(404)
        .send(
          new ServerNodeError(
            ServerNodeError.reasons.SubscriptionNotFound,
            request.params.publicIdentifier,
            request.params,
          ).toJson(),
        );
    }
    return reply.status(200).send({ url });
  },
);

server.get<{ Params: NodeParams.GetListeners }>(
  "/:publicIdentifier/event",
  {
    schema: {
      params: NodeParams.GetListenersSchema,
      response: NodeResponses.GetListenersSchema,
    },
  },
  async (request, reply) => {
    const subs = await store.getSubscriptions(request.params.publicIdentifier);
    return reply.status(200).send(subs);
  },
);

server.post<{ Body: NodeParams.Admin }>(
  "/clear-store",
  { schema: { body: NodeParams.AdminSchema, response: NodeResponses.AdminSchema } },
  async (request, reply) => {
    if (request.body.adminToken !== config.adminToken) {
      return reply.status(401).send({ message: "Unauthorized" });
    }
    try {
      await store.clear();
      return reply.status(200).send({ message: "success" });
    } catch (e) {
      return reply.status(500).send(
        new ServerNodeError(ServerNodeError.reasons.ClearStoreFailed, "", request.body, {
          storeError: e.message,
        }).toJson(),
      );
    }
  },
);

server.post<{ Body: NodeParams.RetryWithdrawTransaction }>(
  "/withdraw/retry",
  {
    schema: {
      body: NodeParams.RetryWithdrawTransactionSchema,
      response: NodeResponses.RetryWithdrawTransactionSchema,
    },
  },
  async (request, reply) => {
    if (request.body.adminToken !== config.adminToken) {
      return reply.status(401).send({ message: "Unauthorized" });
    }
    try {
      const json = await store.getWithdrawalCommitment(request.body.transferId);
      if (!json) {
        return reply.status(404).send({ message: "Commitment not found" });
      }
      const commitment = await WithdrawCommitment.fromJson(json);
      const channel = await store.getChannelState(json.channelAddress);
      if (!channel) {
        return reply
          .status(404)
          .send(new ServerNodeError(ServerNodeError.reasons.ChannelNotFound, "", request.params).toJson());
      }
      if (!json.bobSignature || !json.aliceSignature) {
        return reply.status(500).send({ message: "Commitment not double signed" });
      }
      const chainService = getChainService(channel.aliceIdentifier) ?? getChainService(channel.bobIdentifier);
      if (!chainService) {
        return reply.status(404).send({ message: "Chain service not found" });
      }
      const tx = await chainService.sendWithdrawTx(channel, await commitment.getSignedTransaction());
      if (tx.isError) {
        return reply.status(500).send(tx.getError()!.toJson());
      }
      return reply.status(200).send({
        transactionHash: tx.getValue().hash,
        transferId: request.body.transferId,
        channelAddress: channel.channelAddress,
      });
    } catch (e) {
      return reply.status(500).send(
        new ServerNodeError(ServerNodeError.reasons.ClearStoreFailed, "", request.body, {
          storeError: e.message,
        }).toJson(),
      );
    }
  },
);

server.post<{ Body: NodeParams.CreateNode }>(
  "/node",
  { schema: { body: NodeParams.CreateNodeSchema, response: NodeResponses.CreateNodeSchema } },
  async (request, reply) => {
    try {
      let storedMnemonic = await store.getMnemonic();
      if (request.body.mnemonic && request.body.mnemonic !== storedMnemonic) {
        logger.warn({}, "Mnemonic provided, resetting stored mnemonic");
        // new mnemonic, reset nodes and store mnemonic
        await deleteNodes(store);
        store.setMnemonic(request.body.mnemonic);
        storedMnemonic = request.body.mnemonic;
      }
      const newNode = await createNode(request.body.index, store, storedMnemonic!, request.body.skipCheckIn ?? false);
      return reply.status(200).send({
        index: request.body.index,
        publicIdentifier: newNode.publicIdentifier,
        signerAddress: newNode.signerAddress,
      } as NodeResponses.CreateNode);
    } catch (e) {
      logger.error({ error: e.toJson() });
      return reply.status(500).send(
        new ServerNodeError(ServerNodeError.reasons.CreateNodeFailed, "", request.body, {
          createNodeError: e.message,
          createNodeStack: e.stack,
        }).toJson(),
      );
    }
  },
);

const JsonRpcRequestSchema = Type.Object({
  method: Type.String(),
  params: Type.Any(),
});
type JsonRpcRequest = Static<typeof JsonRpcRequestSchema>;

server.post<{ Params: { chainId: string }; Body: JsonRpcRequest }>(
  "/ethprovider/:chainId",
  { schema: { body: JsonRpcRequestSchema } },
  async (request, reply) => {
    const provider = _providers[parseInt(request.params.chainId)];
    if (!provider) {
      return reply
        .status(400)
        .send(new ServerNodeError(ServerNodeError.reasons.ProviderNotConfigured, "", request.body.params).toJson());
    }
    try {
      const result = await provider.send(request.body.method, request.body.params);
      return reply.status(200).send({ result });
    } catch (e) {
      // Do not touch provider errors
      return reply.status(500).send({ message: e.message, stack: e.stack });
    }
  },
);

server.listen(8000, "0.0.0.0", (err, address) => {
  if (err) {
    logger.error(err);
    process.exit(1);
  }
  logger.info(`Server listening at ${address}`);
});
