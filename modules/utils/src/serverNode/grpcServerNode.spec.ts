import { expect } from "chai";
import * as proto_loader from "@grpc/proto-loader";
import * as grpc from "grpc";
import { GrpcMockServer, ProtoUtils } from "@rhlsthrm/grpc-mock-server";
import { GrpcTypes } from "@connext/vector-types";
import { RpcOptions } from "@protobuf-ts/runtime-rpc";

import { getTestLoggers } from "../test/logger";
import { getRandomIdentifier, getSignerAddressFromPublicIdentifier } from "../identifiers";

import { GRPCServerNodeService } from "./grpcServerNode";

const PROTO_PATH = "./node_modules/@connext/vector-types/proto/servernode.proto";
const PKG_NAME = "com.vector";
const SERVICE_NAME = "ServerNodeService";

const pkgDef = grpc.loadPackageDefinition(proto_loader.loadSync(PROTO_PATH));
const proto = ProtoUtils.getProtoFromPkgDefinition("com.vector", pkgDef);

const implementations = {
  async getPing(call: any, callback: any) {
    const response = new proto.Pong.constructor({ message: "pong" });
    callback(null, response);
  },
  getConfig(input: any, callback: any): Promise<GrpcTypes.Configs> {
    throw new Error("Method not implemented.");
  },
  async getStatus(input: any, callback: any) {
    console.log("getStatus =======> input: ", input);
    const response: GrpcTypes.Status = new proto.Status.constructor({
      public_identifier: input.request.publicIdentifier,
      signer_address: getSignerAddressFromPublicIdentifier(input.request.publicIdentifier),
      Obj: {
        starting_block: "0x1",
        current_block: "0x1",
        highest_block: "0x1",
      },
      ProviderSyncing: true,
      version: "0.0.1",
    });
    callback(null, response);
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

  it("should ping", async () => {
    const result = await client.getPing();
    expect(result.getError()).to.not.be.ok;
    expect(result.getValue()).to.eq("pong");
  });

  it.only("should getStatus", async () => {
    const pub = getRandomIdentifier();
    console.log("pub: ", pub);
    const result = await client.getStatus(pub);
    console.log("result: ", result);
    expect(result.getError()).to.not.be.ok;
    expect(result.getValue()).to.deep.eq({});
  });
});
