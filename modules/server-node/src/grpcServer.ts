// Setup up Server gRPC

// useful links:
// https://github.com/timostamm/protobuf-ts/tree/master/packages/example-node-grpc-server

import * as grpc from "@grpc/grpc-js";
import {
  jsonifyError,
  GrpcTypes,
  ChannelRpcMethods,
  EngineEvents,
  EngineEvent,
  EngineEventMap,
} from "@connext/vector-types";
import { constructRpcRequest } from "@connext/vector-utils";
import { Evt } from "evt";

import { createNode, deleteNodes, getNode } from "./helpers/nodes";
import { ServerNodeError } from "./helpers/errors";

import { logger, store } from ".";

const DEFAULT_PORT = 5000;

// export so test can control it
export const evts: { [eventName in EngineEvent]: Evt<EngineEventMap[eventName]> } = {
  CONDITIONAL_TRANSFER_CREATED: new Evt(),
  CONDITIONAL_TRANSFER_RESOLVED: new Evt(),
  DEPOSIT_RECONCILED: new Evt(),
  IS_ALIVE: new Evt(),
  REQUEST_COLLATERAL: new Evt(),
  RESTORE_STATE_EVENT: new Evt(),
  SETUP: new Evt(),
  WITHDRAWAL_CREATED: new Evt(),
  WITHDRAWAL_RESOLVED: new Evt(),
  WITHDRAWAL_RECONCILED: new Evt(),
};

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

      // every node needs to register to evts so that events get sent over as part of the stream
      const newNode = await createNode(call.request.index, store, storedMnemonic!, call.request.skipCheckIn ?? false);
      newNode.on(EngineEvents.CONDITIONAL_TRANSFER_CREATED, (data) => {
        evts.CONDITIONAL_TRANSFER_CREATED.post(data);
      });
      newNode.on(EngineEvents.CONDITIONAL_TRANSFER_RESOLVED, (data) => {
        evts.CONDITIONAL_TRANSFER_RESOLVED.post(data);
      });
      newNode.on(EngineEvents.DEPOSIT_RECONCILED, (data) => {
        evts.DEPOSIT_RECONCILED.post(data);
      });
      newNode.on(EngineEvents.IS_ALIVE, (data) => {
        evts.IS_ALIVE.post(data);
      });
      newNode.on(EngineEvents.REQUEST_COLLATERAL, (data) => {
        evts.REQUEST_COLLATERAL.post(data);
      });
      newNode.on(EngineEvents.RESTORE_STATE_EVENT, (data) => {
        evts.RESTORE_STATE_EVENT.post(data);
      });
      newNode.on(EngineEvents.SETUP, (data) => {
        evts.SETUP.post(data);
      });
      newNode.on(EngineEvents.WITHDRAWAL_CREATED, (data) => {
        evts.WITHDRAWAL_CREATED.post(data);
      });
      newNode.on(EngineEvents.WITHDRAWAL_RECONCILED, (data) => {
        evts.WITHDRAWAL_RECONCILED.post(data);
      });
      newNode.on(EngineEvents.WITHDRAWAL_RESOLVED, (data) => {
        evts.WITHDRAWAL_RESOLVED.post(data);
      });

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
  ) => {
    evts.CONDITIONAL_TRANSFER_CREATED.attach((data) => {
      console.log("conditionalTransferCreatedStream ====> data: ", data);
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
    call: grpc.ServerWritableStream<GrpcTypes.Empty, GrpcTypes.ConditionalTransferCreatedPayload>,
  ) => {
    evts.CONDITIONAL_TRANSFER_RESOLVED.attach((data) => {
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

  depositReconciledStream: (call: grpc.ServerWritableStream<GrpcTypes.Empty, GrpcTypes.DepositReconciledPayload>) => {
    evts.DEPOSIT_RECONCILED.attach((data) => {
      call.write({ ...data, meta: data.meta ? GrpcTypes.Struct.fromJson(data.meta) : undefined });
    });
  },

  isAliveStream: (call: grpc.ServerWritableStream<GrpcTypes.Empty, GrpcTypes.IsAlivePayload>) => {
    evts.IS_ALIVE.attach((data) => {
      call.write(data);
    });
  },

  requestCollateralStream: (call: grpc.ServerWritableStream<GrpcTypes.Empty, GrpcTypes.RequestCollateralPayload>) => {
    evts.REQUEST_COLLATERAL.attach((data) => {
      call.write({ ...data, meta: data.meta ? GrpcTypes.Struct.fromJson(data.meta) : undefined });
    });
  },

  restoreStateStream: (call: grpc.ServerWritableStream<GrpcTypes.Empty, GrpcTypes.SetupPayload>) => {
    evts.RESTORE_STATE_EVENT.attach((data) => {
      call.write({ ...data, meta: data.meta ? GrpcTypes.Struct.fromJson(data.meta) : undefined });
    });
  },

  setupStream: (call: grpc.ServerWritableStream<GrpcTypes.Empty, GrpcTypes.SetupPayload>) => {
    evts.SETUP.attach((data) => {
      call.write({ ...data, meta: data.meta ? GrpcTypes.Struct.fromJson(data.meta) : undefined });
    });
  },

  withdrawalCreatedStream: (call: grpc.ServerWritableStream<GrpcTypes.Empty, GrpcTypes.WithdrawalCreatedPayload>) => {
    evts.WITHDRAWAL_CREATED.attach((data) => {
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
    call: grpc.ServerWritableStream<GrpcTypes.Empty, GrpcTypes.WithdrawalReconciledPayload>,
  ) => {
    evts.WITHDRAWAL_RECONCILED.attach((data) => {
      call.write({ ...data, meta: data.meta ? GrpcTypes.Struct.fromJson(data.meta) : undefined });
    });
  },

  withdrawalResolvedStream: (call: grpc.ServerWritableStream<GrpcTypes.Empty, GrpcTypes.WithdrawalCreatedPayload>) => {
    evts.WITHDRAWAL_RESOLVED.attach((data) => {
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
