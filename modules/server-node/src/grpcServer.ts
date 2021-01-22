// Setup up Server gRPC

// useful links:
// https://github.com/timostamm/protobuf-ts/tree/master/packages/example-node-grpc-server

import * as grpc from "@grpc/grpc-js";
import { jsonifyError, GrpcTypes } from "@connext/vector-types";

import { createNode, deleteNodes } from "./helpers/nodes";

import { logger, store } from ".";

const host = "0.0.0.0:5000";

const vectorService: GrpcTypes.IVectorService = {
  clearStore: () => undefined,
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
  createTransfer: () => undefined,
  deposit: () => undefined,
  ethProvider: () => undefined,
  getActiveTransfers: () => undefined,
  getChannelState: () => undefined,
  getChannelStateByParticipants: () => undefined,
  getChannelStates: () => undefined,
  getConfig: () => undefined,
  getPing: () => undefined,
  getRegisteredTransfers: () => undefined,
  getStatus: () => undefined,
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
  server.addService(GrpcTypes.vectorServiceDefinition, vectorService);
  return server;
}

export const setupServer = async (): Promise<grpc.Server> => {
  return new Promise((res, rej) => {
    const server = getServer();
    server.bindAsync(host, grpc.ServerCredentials.createInsecure(), (err: Error | null, port: number) => {
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
