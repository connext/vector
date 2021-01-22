import { expect } from "chai";
import * as proto_loader from "@grpc/proto-loader";
import * as grpc from "grpc";
import { GrpcMockServer, ProtoUtils } from "@rhlsthrm/grpc-mock-server";
import { GrpcTypes } from "@connext/vector-types";
import { JsonValue } from "@protobuf-ts/runtime";
import { MethodInfo, RpcOptions } from "@protobuf-ts/runtime-rpc";

import { getTestLoggers } from "../test/logger";

import { GRPCServerNodeService } from "./grpcServerNode";

const PROTO_PATH = "./node_modules/@connext/vector-types/proto/servernode.proto";
const PKG_NAME = "com.vector";
const SERVICE_NAME = "ServerNodeService";

const pkgDef = grpc.loadPackageDefinition(proto_loader.loadSync(PROTO_PATH));
const proto = ProtoUtils.getProtoFromPkgDefinition("com.vector", pkgDef);

const implementations = {
  async getPing(call: GrpcTypes.Empty, callback: any) {
    const response: any = new proto.Pong.constructor({ message: "pong" });
    callback(null, response);
  },
  getConfig(input: GrpcTypes.Empty, options?: RpcOptions): Promise<GrpcTypes.Configs> {
    throw new Error("Method not implemented.");
  },
  getStatus(input: GrpcTypes.TPublicIdentifier, options?: RpcOptions): Promise<GrpcTypes.Status> {
    throw new Error("Method not implemented.");
  },
  getChannelState(
    input: GrpcTypes.ChannelStateRequest,
    options?: RpcOptions,
  ): Promise<GrpcTypes.FullChannelStateOrUndefined> {
    throw new Error("Method not implemented.");
  },
  getChannelStates(input: GrpcTypes.Empty, options?: RpcOptions): Promise<GrpcTypes.FullChannelStates> {
    throw new Error("Method not implemented.");
  },
  getChannelStateByParticipants(
    input: GrpcTypes.ChannelStateByParticipantsRequest,
    options?: RpcOptions,
  ): Promise<GrpcTypes.FullChannelStateOrUndefined> {
    throw new Error("Method not implemented.");
  },
  transferState(input: GrpcTypes.TransfersRequest, options?: RpcOptions): Promise<GrpcTypes.TransferStateReply> {
    throw new Error("Method not implemented.");
  },
  getTransferStateByRoutingId(
    input: GrpcTypes.TransferStateByRoutingIdRequest,
    options?: RpcOptions,
  ): Promise<GrpcTypes.FullTransferStateOrUndefined> {
    throw new Error("Method not implemented.");
  },
  getTransferStatesByRoutingId(
    input: GrpcTypes.TransferStatesByRoutingIdRequest,
    options?: RpcOptions,
  ): Promise<GrpcTypes.FullTransferStates> {
    throw new Error("Method not implemented.");
  },
  getActiveTransfers(
    input: GrpcTypes.ActiveTransfersRequest,
    options?: RpcOptions,
  ): Promise<GrpcTypes.FullTransferStates> {
    throw new Error("Method not implemented.");
  },
  getRegisteredTransfers(
    input: GrpcTypes.RegisteredTransfersRequest,
    options?: RpcOptions,
  ): Promise<GrpcTypes.RegisteredTransfers> {
    throw new Error("Method not implemented.");
  },
  setup(input: GrpcTypes.SetupRequest, options?: RpcOptions): Promise<GrpcTypes.SetupReply> {
    throw new Error("Method not implemented.");
  },
  internalSetup(input: GrpcTypes.SetupRequest, options?: RpcOptions): Promise<GrpcTypes.FullChannelState> {
    throw new Error("Method not implemented.");
  },
  deposit(input: GrpcTypes.DepositRequest, options?: RpcOptions): Promise<GrpcTypes.FullChannelState> {
    throw new Error("Method not implemented.");
  },
  sendDepositTx(input: GrpcTypes.DepositTxRequest, options?: RpcOptions): Promise<GrpcTypes.TxHash> {
    throw new Error("Method not implemented.");
  },
  sendDisputeChannelTx(input: GrpcTypes.ChannelResquest, options?: RpcOptions): Promise<GrpcTypes.TxHash> {
    throw new Error("Method not implemented.");
  },
  sendDefundChannelTx(input: GrpcTypes.ChannelResquest, options?: RpcOptions): Promise<GrpcTypes.TxHash> {
    throw new Error("Method not implemented.");
  },
  sendDisputeTransfer(input: GrpcTypes.TransferResquest, options?: RpcOptions): Promise<GrpcTypes.TxHash> {
    throw new Error("Method not implemented.");
  },
  sendDefundTransfer(input: GrpcTypes.TransferResquest, options?: RpcOptions): Promise<GrpcTypes.TxHash> {
    throw new Error("Method not implemented.");
  },
  sendRequestCollateral(input: GrpcTypes.DepositRequest, options?: RpcOptions): Promise<GrpcTypes.CollateralReply> {
    throw new Error("Method not implemented.");
  },
  createTransfer(
    input: GrpcTypes.ConditionalTransferRequest,
    options?: RpcOptions,
  ): Promise<GrpcTypes.ResolveTransferReply> {
    throw new Error("Method not implemented.");
  },
  resolveTransfer(
    input: GrpcTypes.ResolveTransferRequest,
    options?: RpcOptions,
  ): Promise<GrpcTypes.ResolveTransferReply> {
    throw new Error("Method not implemented.");
  },
  withdraw(input: GrpcTypes.WithdrawRequest, options?: RpcOptions): Promise<GrpcTypes.WithdrawReply> {
    throw new Error("Method not implemented.");
  },
  restoreState(input: GrpcTypes.RestoreStateRequest, options?: RpcOptions): Promise<GrpcTypes.RestoreStateReply> {
    throw new Error("Method not implemented.");
  },
  subscribe(input: GrpcTypes.SubscribeRequest, options?: RpcOptions): Promise<GrpcTypes.SubscribeReply> {
    throw new Error("Method not implemented.");
  },
  getSubscription(input: GrpcTypes.SubscriptionRequest, options?: RpcOptions): Promise<GrpcTypes.Subscription> {
    throw new Error("Method not implemented.");
  },
  getSubscriptionWithOnlyPublicIdentifier(
    input: GrpcTypes.SubscriptionWithPublicIdentifierRequest,
    options?: RpcOptions,
  ): Promise<GrpcTypes.SubscriptionWithPublicIdentifierReply> {
    throw new Error("Method not implemented.");
  },
  clearStore(input: GrpcTypes.ClearStoreRequest, options?: RpcOptions): Promise<GrpcTypes.ClearStoreReply> {
    throw new Error("Method not implemented.");
  },
  createNode(input: GrpcTypes.CreateNodeRequest, options?: RpcOptions): Promise<GrpcTypes.CreateNodeReply> {
    throw new Error("Method not implemented.");
  },
  ethProvider(input: GrpcTypes.EthProviderRequest, options?: RpcOptions): Promise<GrpcTypes.EthProviderReply> {
    throw new Error("Method not implemented.");
  },
};

describe("GRPCServerNode", () => {
  const { log } = getTestLoggers("GRPCServerNode", "error");
  let client: GRPCServerNodeService;
  before(async () => {
    const server = new GrpcMockServer();

    server.addService(PROTO_PATH, PKG_NAME, SERVICE_NAME, implementations);
    server.start();

    client = await GRPCServerNodeService.connect(server.serverAddress, log);
  });

  it.only("should ping", async () => {
    const ping = await client.getPing();
    console.log("ping: ", ping.getValue());
  });
});
