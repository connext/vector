// Setup up Server gRPC

// useful links:
// https://github.com/timostamm/protobuf-ts/tree/master/packages/example-node-grpc-server

import * as grpc from "@grpc/grpc-js";
import { jsonifyError, GrpcTypes, ChannelRpcMethods } from "@connext/vector-types";
import { constructRpcRequest } from "@connext/vector-utils";

import { createNode, deleteNodes, getNode } from "./helpers/nodes";
import { ServerNodeError } from "./helpers/errors";

import { logger, store } from ".";

const DEFAULT_PORT = 5000;

const vectorService: GrpcTypes.IServerNodeService = {
  async getPing(
    call: grpc.ServerUnaryCall<GrpcTypes.Empty, GrpcTypes.GenericMessageResponse>,
    callback: grpc.sendUnaryData<GrpcTypes.GenericMessageResponse>,
  ): Promise<void> {
    callback(null, { message: "pong" });
  },

  async getStatus(
    call: grpc.ServerUnaryCall<GrpcTypes.GetStatusRequest, GrpcTypes.Status>,
    callback: grpc.sendUnaryData<GrpcTypes.Status>,
  ): Promise<void> {
    const engine = getNode(call.request.publicIdentifier);
    if (!engine) {
      const error = new ServerNodeError(
        ServerNodeError.reasons.NodeNotFound,
        call.request.publicIdentifier,
        call.request,
      );
      logger.error({ error }, "Could not find engine");
      return callback({ code: grpc.status.NOT_FOUND, details: JSON.stringify(error) });
    }
    try {
      const params = constructRpcRequest(ChannelRpcMethods.chan_getStatus, {});
      const res = await engine.request<"chan_getStatus">(params);

      callback(null, res);
    } catch (e) {
      logger.error({ error: jsonifyError(e) });
      callback({ code: grpc.status.UNKNOWN, details: JSON.stringify(e) });
    }
  },

  async getRouterConfig(
    call: grpc.ServerUnaryCall<GrpcTypes.GetRouterConfigRequest, GrpcTypes.RouterConfig>,
    callback: grpc.sendUnaryData<GrpcTypes.RouterConfig>,
  ): Promise<void> {
    const engine = getNode(call.request.publicIdentifier);
    if (!engine) {
      const error = new ServerNodeError(
        ServerNodeError.reasons.NodeNotFound,
        call.request.publicIdentifier,
        call.request,
      );
      logger.error({ error }, "Could not find engine");
      return callback({ code: grpc.status.NOT_FOUND, details: JSON.stringify(error) });
    }
    try {
      const params = constructRpcRequest(ChannelRpcMethods.chan_getStatus, {});
      const res = await engine.request<"chan_getRouterConfig">(params);

      callback(null, res);
    } catch (e) {
      logger.error({ error: jsonifyError(e) });
      callback({ code: grpc.status.UNKNOWN, details: JSON.stringify(e) });
    }
  },

  async createNode(
    call: grpc.ServerUnaryCall<GrpcTypes.CreateNodeRequest, GrpcTypes.CreateNodeReply>,
    callback: grpc.sendUnaryData<GrpcTypes.CreateNodeReply>,
  ): Promise<void> {
    try {
      let storedMnemonic = await store.getMnemonic();
      if (call.request.mnemonic && call.request.mnemonic !== storedMnemonic) {
        logger.warn({}, "Mnemonic provided, resetting stored mnemonic");
        // new mnemonic, reset nodes and store mnemonic
        await deleteNodes(store);
        store.setMnemonic(call.request.mnemonic);
        storedMnemonic = call.request.mnemonic;
      }
      const newNode = await createNode(call.request.index, store, storedMnemonic!, call.request.skipCheckIn ?? false);
      callback(null, {
        index: call.request.index,
        publicIdentifier: newNode.publicIdentifier,
        signerAddress: newNode.signerAddress,
      });
    } catch (e) {
      logger.error({ error: e.toJson() });
      callback({ code: grpc.status.INTERNAL, details: JSON.stringify(jsonifyError(e)) });
    }
  },

  conditionalTransferCreatedStream: (
    call: grpc.ServerWritableStream<GrpcTypes.Empty, GrpcTypes.ConditionalTransferCreatedPayload>,
  ) => {},

  conditionalTransferResolvedStream: () => undefined,
  depositReconciledStream: () => undefined,
  isAliveStream: () => undefined,
  requestCollateralStream: () => undefined,
  restoreStateStream: () => undefined,
  setupStream: () => undefined,
  withdrawalCreatedStream: () => undefined,
  withdrawalReconciledStream: () => undefined,
  withdrawalResolvedStream: () => undefined,
  getTransferState: () => undefined,
  clearStore: () => undefined,
  createTransfer: () => undefined,
  deposit: () => undefined,
  ethProvider: () => undefined,
  getActiveTransfers: () => undefined,
  getChannelState: () => undefined,
  getChannelStateByParticipants: () => undefined,
  getChannelStates: () => undefined,
  getConfig: () => undefined,
  getRegisteredTransfers: () => undefined,
  getSubscription: () => undefined,
  getSubscriptionWithOnlyPublicIdentifier: () => undefined,
  getTransferStateByRoutingId: () => undefined,
  getTransferStatesByRoutingId: () => undefined,
  internalSetup: () => undefined,
  resolveTransfer: () => undefined,
  restoreState: () => undefined,
  sendDefundChannelTx: () => undefined,
  sendDefundTransfer: () => undefined,
  sendDepositTx: () => undefined,
  sendDisputeChannelTx: () => undefined,
  sendDisputeTransfer: () => undefined,
  sendRequestCollateral: () => undefined,
  setup: () => undefined,
  subscribe: () => undefined,
  transferState: () => undefined,
  withdraw: () => undefined,
};

function getServer(): grpc.Server {
  const server = new grpc.Server();
  server.addService(GrpcTypes.serverNodeServiceDefinition, vectorService);
  return server;
}

export const setupServer = async (port = DEFAULT_PORT): Promise<grpc.Server> => {
  return new Promise((res, rej) => {
    const server = getServer();
    server.bindAsync(`0.0.0.0:${port}`, grpc.ServerCredentials.createInsecure(), (err: Error | null, port: number) => {
      if (err) {
        console.error(`Server error: ${err.message}`);
        rej(err);
      } else {
        console.log(`Server bound on port: ${port}`);
        server.start();
        res(server);
      }
    });
  });
};
