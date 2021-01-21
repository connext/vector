// Setup up Server gRPC

// useful links:
// https://github.com/timostamm/protobuf-ts/tree/master/packages/example-node-grpc-server

import * as grpc from "@grpc/grpc-js";
import { assert } from "@protobuf-ts/runtime";

import { CreateNodeReply, CreateNodeRequest } from "./gen/vector";
import { vectorServiceDefinition, IVectorService } from "./gen/vector.grpc-server";

const host = "0.0.0.0:5000";

const vectorService: IVectorService = {
  clearStore: () => undefined,
  async createNode(
    call: grpc.ServerUnaryCall<CreateNodeRequest, CreateNodeReply>,
    callback: grpc.sendUnaryData<CreateNodeReply>,
  ): Promise<void> {
    // wait for the requested amount of milliseconds
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
    setTimeout(function () {
      switch (call.request.pleaseFail) {
        case FailRequest.MESSAGE_THEN_ERROR_STATUS:
          // does not work, client only receives error
          callback(
            {
              code: grpc.status.RESOURCE_EXHAUSTED,
              details: "you requested an error",
            },
            {
              answer: `You asked: ${call.request.question}`,
              yourDeadline: call.getDeadline().toString(),
              yourFailRequest: call.request.pleaseFail,
              yourRequestHeaders: {},
            },
            trailers,
          );
          break;

        case FailRequest.ERROR_STATUS_ONLY:
          const errorMeta = new grpc.Metadata();
          errorMeta.add("server-trailer", "created by error response on server");
          callback({
            code: grpc.status.RESOURCE_EXHAUSTED,
            details: "you requested an error, no message",
            metadata: errorMeta,
          });
          break;

        case FailRequest.FAIL_REQUEST_NONE:
          callback(
            null,
            {
              answer: `You asked: ${call.request.question}`,
              yourDeadline: call.getDeadline().toString(),
              yourFailRequest: call.request.pleaseFail,
              yourRequestHeaders: {},
            },
            trailers,
          );
          break;
      }
    }, call.request.pleaseDelayResponseMs);
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
};

function getServer(): grpc.Server {
  const server = new grpc.Server();
  server.addService(vectorServiceDefinition, vectorService);
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
