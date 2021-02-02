// Setup up Server gRPC

// useful links:
// https://github.com/timostamm/protobuf-ts/tree/master/packages/example-node-grpc-server

import * as grpc from "@grpc/grpc-js";
import { jsonifyError, GrpcTypes, ChannelRpcMethods, EngineEvents } from "@connext/vector-types";
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
    call: grpc.ServerUnaryCall<GrpcTypes.GenericPublicIdentifierRequest, GrpcTypes.Status>,
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
    call: grpc.ServerWritableStream<
      GrpcTypes.GenericPublicIdentifierRequest,
      GrpcTypes.ConditionalTransferCreatedPayload
    >,
  ) => {
    console.log("CALLED conditionalTransferCreatedStream");
    const engine = getNode(call.request.publicIdentifier);
    if (!engine) {
      const error = new ServerNodeError(
        ServerNodeError.reasons.NodeNotFound,
        call.request.publicIdentifier,
        call.request,
        grpc.status.NOT_FOUND,
      );
      logger.error({ error }, "Could not find engine");
      return call.destroy(error);
    }
    engine.on(EngineEvents.CONDITIONAL_TRANSFER_CREATED, (data) => {
      const safeTransferState = {
        ...data.transfer,
        transferState: GrpcTypes.Struct.fromJson(data.transfer.transferState),
        meta: data.transfer.meta ? GrpcTypes.Struct.fromJson(data.transfer.meta) : undefined,
        transferResolver: data.transfer.transferResolver
          ? GrpcTypes.Struct.fromJson(data.transfer.transferResolver)
          : undefined,
      };
      call.write({
        ...data,
        transfer: safeTransferState,
        activeTransferIds: data.activeTransferIds ?? [],
      });
    });
  },

  conditionalTransferResolvedStream: (
    call: grpc.ServerWritableStream<
      GrpcTypes.GenericPublicIdentifierRequest,
      GrpcTypes.ConditionalTransferCreatedPayload
    >,
  ) => {
    const engine = getNode(call.request.publicIdentifier);
    if (!engine) {
      const error = new ServerNodeError(
        ServerNodeError.reasons.NodeNotFound,
        call.request.publicIdentifier,
        call.request,
        grpc.status.NOT_FOUND,
      );
      logger.error({ error }, "Could not find engine");
      return call.destroy(error);
    }
    engine.on(EngineEvents.CONDITIONAL_TRANSFER_RESOLVED, (data) => {
      const safeTransferState = {
        ...data.transfer,
        transferState: GrpcTypes.Struct.fromJson(data.transfer.transferState),
        meta: data.transfer.meta ? GrpcTypes.Struct.fromJson(data.transfer.meta) : undefined,
        transferResolver: data.transfer.transferResolver
          ? GrpcTypes.Struct.fromJson(data.transfer.transferResolver)
          : undefined,
      };
      call.write({
        ...data,
        transfer: safeTransferState,
        activeTransferIds: data.activeTransferIds ?? [],
      });
    });
  },

  depositReconciledStream: (
    call: grpc.ServerWritableStream<GrpcTypes.GenericPublicIdentifierRequest, GrpcTypes.DepositReconciledPayload>,
  ) => {
    const engine = getNode(call.request.publicIdentifier);
    if (!engine) {
      const error = new ServerNodeError(
        ServerNodeError.reasons.NodeNotFound,
        call.request.publicIdentifier,
        call.request,
        grpc.status.NOT_FOUND,
      );
      logger.error({ error }, "Could not find engine");
      return call.destroy(error);
    }
    engine.on(EngineEvents.DEPOSIT_RECONCILED, (data) => {
      call.write({ ...data, meta: data.meta ? GrpcTypes.Struct.fromJson(data.meta) : undefined });
    });
  },

  isAliveStream: (
    call: grpc.ServerWritableStream<GrpcTypes.GenericPublicIdentifierRequest, GrpcTypes.IsAlivePayload>,
  ) => {
    const engine = getNode(call.request.publicIdentifier);
    if (!engine) {
      const error = new ServerNodeError(
        ServerNodeError.reasons.NodeNotFound,
        call.request.publicIdentifier,
        call.request,
        grpc.status.NOT_FOUND,
      );
      logger.error({ error }, "Could not find engine");
      return call.destroy(error);
    }
    engine.on(EngineEvents.IS_ALIVE, (data) => {
      call.write(data);
    });
  },

  requestCollateralStream: (
    call: grpc.ServerWritableStream<GrpcTypes.GenericPublicIdentifierRequest, GrpcTypes.RequestCollateralPayload>,
  ) => {
    const engine = getNode(call.request.publicIdentifier);
    if (!engine) {
      const error = new ServerNodeError(
        ServerNodeError.reasons.NodeNotFound,
        call.request.publicIdentifier,
        call.request,
        grpc.status.NOT_FOUND,
      );
      logger.error({ error }, "Could not find engine");
      return call.destroy(error);
    }
    engine.on(EngineEvents.REQUEST_COLLATERAL, (data) => {
      call.write({ ...data, meta: data.meta ? GrpcTypes.Struct.fromJson(data.meta) : undefined });
    });
  },

  restoreStateStream: (
    call: grpc.ServerWritableStream<GrpcTypes.GenericPublicIdentifierRequest, GrpcTypes.SetupPayload>,
  ) => {
    const engine = getNode(call.request.publicIdentifier);
    if (!engine) {
      const error = new ServerNodeError(
        ServerNodeError.reasons.NodeNotFound,
        call.request.publicIdentifier,
        call.request,
        grpc.status.NOT_FOUND,
      );
      logger.error({ error }, "Could not find engine");
      return call.destroy(error);
    }
    engine.on(EngineEvents.RESTORE_STATE_EVENT, (data) => {
      call.write({ ...data, meta: data.meta ? GrpcTypes.Struct.fromJson(data.meta) : undefined });
    });
  },

  setupStream: (call: grpc.ServerWritableStream<GrpcTypes.GenericPublicIdentifierRequest, GrpcTypes.SetupPayload>) => {
    const engine = getNode(call.request.publicIdentifier);
    if (!engine) {
      const error = new ServerNodeError(
        ServerNodeError.reasons.NodeNotFound,
        call.request.publicIdentifier,
        call.request,
        grpc.status.NOT_FOUND,
      );
      logger.error({ error }, "Could not find engine");
      return call.destroy(error);
    }
    engine.on(EngineEvents.SETUP, (data) => {
      call.write({ ...data, meta: data.meta ? GrpcTypes.Struct.fromJson(data.meta) : undefined });
    });
  },

  withdrawalCreatedStream: (
    call: grpc.ServerWritableStream<GrpcTypes.GenericPublicIdentifierRequest, GrpcTypes.WithdrawalCreatedPayload>,
  ) => {
    const engine = getNode(call.request.publicIdentifier);
    if (!engine) {
      const error = new ServerNodeError(
        ServerNodeError.reasons.NodeNotFound,
        call.request.publicIdentifier,
        call.request,
        grpc.status.NOT_FOUND,
      );
      logger.error({ error }, "Could not find engine");
      return call.destroy(error);
    }
    engine.on(EngineEvents.WITHDRAWAL_CREATED, (data) => {
      const safeTransferState = {
        ...data.transfer,
        transferState: GrpcTypes.Struct.fromJson(data.transfer.transferState),
        meta: data.transfer.meta ? GrpcTypes.Struct.fromJson(data.transfer.meta) : undefined,
        transferResolver: data.transfer.transferResolver
          ? GrpcTypes.Struct.fromJson(data.transfer.transferResolver)
          : undefined,
      };
      call.write({
        ...data,
        transfer: safeTransferState,
        meta: data.meta ? GrpcTypes.Struct.fromJson(data.meta) : undefined,
      });
    });
  },

  withdrawalReconciledStream: (
    call: grpc.ServerWritableStream<GrpcTypes.GenericPublicIdentifierRequest, GrpcTypes.WithdrawalReconciledPayload>,
  ) => {
    const engine = getNode(call.request.publicIdentifier);
    if (!engine) {
      const error = new ServerNodeError(
        ServerNodeError.reasons.NodeNotFound,
        call.request.publicIdentifier,
        call.request,
        grpc.status.NOT_FOUND,
      );
      logger.error({ error }, "Could not find engine");
      return call.destroy(error);
    }
    engine.on(EngineEvents.WITHDRAWAL_RECONCILED, (data) => {
      call.write(data);
    });
  },

  withdrawalResolvedStream: (
    call: grpc.ServerWritableStream<GrpcTypes.GenericPublicIdentifierRequest, GrpcTypes.WithdrawalCreatedPayload>,
  ) => {
    const engine = getNode(call.request.publicIdentifier);
    if (!engine) {
      const error = new ServerNodeError(
        ServerNodeError.reasons.NodeNotFound,
        call.request.publicIdentifier,
        call.request,
        grpc.status.NOT_FOUND,
      );
      logger.error({ error }, "Could not find engine");
      return call.destroy(error);
    }
    engine.on(EngineEvents.WITHDRAWAL_CREATED, (data) => {
      const safeTransferState = {
        ...data.transfer,
        transferState: GrpcTypes.Struct.fromJson(data.transfer.transferState),
        meta: data.transfer.meta ? GrpcTypes.Struct.fromJson(data.transfer.meta) : undefined,
        transferResolver: data.transfer.transferResolver
          ? GrpcTypes.Struct.fromJson(data.transfer.transferResolver)
          : undefined,
      };
      call.write({
        ...data,
        transfer: safeTransferState,
        meta: data.meta ? GrpcTypes.Struct.fromJson(data.meta) : undefined,
      });
    });
  },

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
