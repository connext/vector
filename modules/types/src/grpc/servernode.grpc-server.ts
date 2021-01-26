// @generated by protobuf-ts 2.0.0-alpha.11 with parameters server_grpc,client_promise,generate_dependencies
// @generated from protobuf file "servernode.proto" (package "com.vector", syntax proto3)
// tslint:disable
import { EthProviderReply } from "./servernode";
import { EthProviderRequest } from "./servernode";
import { WithdrawalReconciledPayload } from "./servernode";
import { WithdrawalCreatedPayload } from "./servernode";
import { RequestCollateralPayload } from "./servernode";
import { DepositReconciledPayload } from "./servernode";
import { ConditionalTransferCreatedPayload } from "./servernode";
import { SetupPayload } from "./servernode";
import { IsAlivePayload } from "./servernode";
import { TransferRequest } from "./servernode";
import { RestoreStateRequest } from "./servernode";
import { WithdrawRequest } from "./servernode";
import { ResolveTransferRequest } from "./servernode";
import { ConditionalTransferRequest } from "./servernode";
import { TxHash } from "./servernode";
import { DepositTxRequest } from "./servernode";
import { DepositRequest } from "./servernode";
import { SetupRequest } from "./servernode";
import { CreateNodeReply } from "./servernode";
import { CreateNodeRequest } from "./servernode";
import { ClearStoreRequest } from "./servernode";
import { RegisteredTransfers } from "./servernode";
import { RegisteredTransfersRequest } from "./servernode";
import { ActiveTransfersRequest } from "./servernode";
import { FullTransferStates } from "./servernode";
import { TransferStatesByRoutingIdRequest } from "./servernode";
import { TransferStateByRoutingIdRequest } from "./servernode";
import { FullTransferState } from "./servernode";
import { TransfersRequest } from "./servernode";
import { ChannelStateByParticipantsRequest } from "./servernode";
import { FullChannelStates } from "./servernode";
import { FullChannelState } from "./servernode";
import { ChannelStateRequest } from "./servernode";
import { RouterConfig } from "./servernode";
import { GetRouterConfigRequest } from "./servernode";
import { Status } from "./servernode";
import { GetStatusRequest } from "./servernode";
import { Configs } from "./servernode";
import { GenericMessageResponse } from "./servernode";
import { Empty } from "./servernode";
import * as grpc from "@grpc/grpc-js";
/**
 * Server Node Service
 * Describes the Vector Server Node's interface
 *
 * @generated from protobuf service com.vector.ServerNodeService
 */
export interface IServerNodeService extends grpc.UntypedServiceImplementation {
    /**
     * general metadata getters
     *
     * @generated from protobuf rpc: GetPing(com.vector.Empty) returns (com.vector.GenericMessageResponse);
     */
    getPing: grpc.handleUnaryCall<Empty, GenericMessageResponse>;
    /**
     * @generated from protobuf rpc: GetConfig(com.vector.Empty) returns (com.vector.Configs);
     */
    getConfig: grpc.handleUnaryCall<Empty, Configs>;
    /**
     * @generated from protobuf rpc: GetStatus(com.vector.GetStatusRequest) returns (com.vector.Status);
     */
    getStatus: grpc.handleUnaryCall<GetStatusRequest, Status>;
    /**
     * @generated from protobuf rpc: GetRouterConfig(com.vector.GetRouterConfigRequest) returns (com.vector.RouterConfig);
     */
    getRouterConfig: grpc.handleUnaryCall<GetRouterConfigRequest, RouterConfig>;
    /**
     * channel and transfer state getters
     *
     * @generated from protobuf rpc: GetChannelState(com.vector.ChannelStateRequest) returns (com.vector.FullChannelState);
     */
    getChannelState: grpc.handleUnaryCall<ChannelStateRequest, FullChannelState>;
    /**
     * @generated from protobuf rpc: GetChannelStates(com.vector.Empty) returns (com.vector.FullChannelStates);
     */
    getChannelStates: grpc.handleUnaryCall<Empty, FullChannelStates>;
    /**
     * @generated from protobuf rpc: GetChannelStateByParticipants(com.vector.ChannelStateByParticipantsRequest) returns (com.vector.FullChannelState);
     */
    getChannelStateByParticipants: grpc.handleUnaryCall<ChannelStateByParticipantsRequest, FullChannelState>;
    /**
     * @generated from protobuf rpc: GetTransferState(com.vector.TransfersRequest) returns (com.vector.FullTransferState);
     */
    getTransferState: grpc.handleUnaryCall<TransfersRequest, FullTransferState>;
    /**
     * @generated from protobuf rpc: GetTransferStateByRoutingId(com.vector.TransferStateByRoutingIdRequest) returns (com.vector.FullTransferState);
     */
    getTransferStateByRoutingId: grpc.handleUnaryCall<TransferStateByRoutingIdRequest, FullTransferState>;
    /**
     * @generated from protobuf rpc: GetTransferStatesByRoutingId(com.vector.TransferStatesByRoutingIdRequest) returns (com.vector.FullTransferStates);
     */
    getTransferStatesByRoutingId: grpc.handleUnaryCall<TransferStatesByRoutingIdRequest, FullTransferStates>;
    /**
     * @generated from protobuf rpc: GetActiveTransfers(com.vector.ActiveTransfersRequest) returns (com.vector.FullTransferStates);
     */
    getActiveTransfers: grpc.handleUnaryCall<ActiveTransfersRequest, FullTransferStates>;
    /**
     * @generated from protobuf rpc: GetRegisteredTransfers(com.vector.RegisteredTransfersRequest) returns (com.vector.RegisteredTransfers);
     */
    getRegisteredTransfers: grpc.handleUnaryCall<RegisteredTransfersRequest, RegisteredTransfers>;
    /**
     * external interface for server node functionality
     *
     * @generated from protobuf rpc: ClearStore(com.vector.ClearStoreRequest) returns (com.vector.Empty);
     */
    clearStore: grpc.handleUnaryCall<ClearStoreRequest, Empty>;
    /**
     * @generated from protobuf rpc: CreateNode(com.vector.CreateNodeRequest) returns (com.vector.CreateNodeReply);
     */
    createNode: grpc.handleUnaryCall<CreateNodeRequest, CreateNodeReply>;
    /**
     * @generated from protobuf rpc: Setup(com.vector.SetupRequest) returns (com.vector.FullChannelState);
     */
    setup: grpc.handleUnaryCall<SetupRequest, FullChannelState>;
    /**
     * @generated from protobuf rpc: InternalSetup(com.vector.SetupRequest) returns (com.vector.FullChannelState);
     */
    internalSetup: grpc.handleUnaryCall<SetupRequest, FullChannelState>;
    /**
     * @generated from protobuf rpc: Deposit(com.vector.DepositRequest) returns (com.vector.FullChannelState);
     */
    deposit: grpc.handleUnaryCall<DepositRequest, FullChannelState>;
    /**
     * @generated from protobuf rpc: SendDepositTx(com.vector.DepositTxRequest) returns (com.vector.TxHash);
     */
    sendDepositTx: grpc.handleUnaryCall<DepositTxRequest, TxHash>;
    /**
     * @generated from protobuf rpc: SendRequestCollateral(com.vector.DepositRequest) returns (com.vector.FullChannelState);
     */
    sendRequestCollateral: grpc.handleUnaryCall<DepositRequest, FullChannelState>;
    /**
     * @generated from protobuf rpc: CreateTransfer(com.vector.ConditionalTransferRequest) returns (com.vector.FullChannelState);
     */
    createTransfer: grpc.handleUnaryCall<ConditionalTransferRequest, FullChannelState>;
    /**
     * @generated from protobuf rpc: ResolveTransfer(com.vector.ResolveTransferRequest) returns (com.vector.FullChannelState);
     */
    resolveTransfer: grpc.handleUnaryCall<ResolveTransferRequest, FullChannelState>;
    /**
     * @generated from protobuf rpc: Withdraw(com.vector.WithdrawRequest) returns (com.vector.FullChannelState);
     */
    withdraw: grpc.handleUnaryCall<WithdrawRequest, FullChannelState>;
    /**
     * @generated from protobuf rpc: RestoreState(com.vector.RestoreStateRequest) returns (com.vector.FullChannelState);
     */
    restoreState: grpc.handleUnaryCall<RestoreStateRequest, FullChannelState>;
    /**
     * dispute methods
     *
     * @generated from protobuf rpc: SendDisputeChannelTx(com.vector.ChannelStateRequest) returns (com.vector.TxHash);
     */
    sendDisputeChannelTx: grpc.handleUnaryCall<ChannelStateRequest, TxHash>;
    /**
     * @generated from protobuf rpc: SendDefundChannelTx(com.vector.ChannelStateRequest) returns (com.vector.TxHash);
     */
    sendDefundChannelTx: grpc.handleUnaryCall<ChannelStateRequest, TxHash>;
    /**
     * @generated from protobuf rpc: SendDisputeTransfer(com.vector.TransferRequest) returns (com.vector.TxHash);
     */
    sendDisputeTransfer: grpc.handleUnaryCall<TransferRequest, TxHash>;
    /**
     * @generated from protobuf rpc: SendDefundTransfer(com.vector.TransferRequest) returns (com.vector.TxHash);
     */
    sendDefundTransfer: grpc.handleUnaryCall<TransferRequest, TxHash>;
    /**
     * subscriptions - server to client stream
     *
     * @generated from protobuf rpc: IsAliveStream(com.vector.Empty) returns (stream com.vector.IsAlivePayload);
     */
    isAliveStream: grpc.handleServerStreamingCall<Empty, IsAlivePayload>;
    /**
     * @generated from protobuf rpc: SetupStream(com.vector.Empty) returns (stream com.vector.SetupPayload);
     */
    setupStream: grpc.handleServerStreamingCall<Empty, SetupPayload>;
    /**
     * @generated from protobuf rpc: ConditionalTransferCreatedStream(com.vector.Empty) returns (stream com.vector.ConditionalTransferCreatedPayload);
     */
    conditionalTransferCreatedStream: grpc.handleServerStreamingCall<Empty, ConditionalTransferCreatedPayload>;
    /**
     * @generated from protobuf rpc: ConditionalTransferResolvedStream(com.vector.Empty) returns (stream com.vector.ConditionalTransferCreatedPayload);
     */
    conditionalTransferResolvedStream: grpc.handleServerStreamingCall<Empty, ConditionalTransferCreatedPayload>;
    /**
     * @generated from protobuf rpc: DepositReconciledStream(com.vector.Empty) returns (stream com.vector.DepositReconciledPayload);
     */
    depositReconciledStream: grpc.handleServerStreamingCall<Empty, DepositReconciledPayload>;
    /**
     * @generated from protobuf rpc: RequestCollateralStream(com.vector.Empty) returns (stream com.vector.RequestCollateralPayload);
     */
    requestCollateralStream: grpc.handleServerStreamingCall<Empty, RequestCollateralPayload>;
    /**
     * @generated from protobuf rpc: WithdrawalCreatedStream(com.vector.Empty) returns (stream com.vector.WithdrawalCreatedPayload);
     */
    withdrawalCreatedStream: grpc.handleServerStreamingCall<Empty, WithdrawalCreatedPayload>;
    /**
     * @generated from protobuf rpc: WithdrawalResolvedStream(com.vector.Empty) returns (stream com.vector.WithdrawalCreatedPayload);
     */
    withdrawalResolvedStream: grpc.handleServerStreamingCall<Empty, WithdrawalCreatedPayload>;
    /**
     * @generated from protobuf rpc: WithdrawalReconciledStream(com.vector.Empty) returns (stream com.vector.WithdrawalReconciledPayload);
     */
    withdrawalReconciledStream: grpc.handleServerStreamingCall<Empty, WithdrawalReconciledPayload>;
    /**
     * @generated from protobuf rpc: RestoreStateStream(com.vector.Empty) returns (stream com.vector.SetupPayload);
     */
    restoreStateStream: grpc.handleServerStreamingCall<Empty, SetupPayload>;
    /**
     * eth provider pass-through
     *
     * @generated from protobuf rpc: EthProvider(com.vector.EthProviderRequest) returns (com.vector.EthProviderReply);
     */
    ethProvider: grpc.handleUnaryCall<EthProviderRequest, EthProviderReply>;
}
/**
 * @grpc/grpc-js definition for the protobuf service com.vector.ServerNodeService.
 *
 * Usage: Implement the interface IServerNodeService and add to a grpc server.
 *
 * ```typescript
 * const server = new grpc.Server();
 * const service: IServerNodeService = ...
 * server.addService(serverNodeServiceDefinition, service);
 * ```
 */
export const serverNodeServiceDefinition: grpc.ServiceDefinition<IServerNodeService> = {
    getPing: {
        path: "/com.vector.ServerNodeService/GetPing",
        originalName: "GetPing",
        requestStream: false,
        responseStream: false,
        responseDeserialize: bytes => GenericMessageResponse.fromBinary(bytes),
        requestDeserialize: bytes => Empty.fromBinary(bytes),
        responseSerialize: value => Buffer.from(GenericMessageResponse.toBinary(value)),
        requestSerialize: value => Buffer.from(Empty.toBinary(value))
    },
    getConfig: {
        path: "/com.vector.ServerNodeService/GetConfig",
        originalName: "GetConfig",
        requestStream: false,
        responseStream: false,
        responseDeserialize: bytes => Configs.fromBinary(bytes),
        requestDeserialize: bytes => Empty.fromBinary(bytes),
        responseSerialize: value => Buffer.from(Configs.toBinary(value)),
        requestSerialize: value => Buffer.from(Empty.toBinary(value))
    },
    getStatus: {
        path: "/com.vector.ServerNodeService/GetStatus",
        originalName: "GetStatus",
        requestStream: false,
        responseStream: false,
        responseDeserialize: bytes => Status.fromBinary(bytes),
        requestDeserialize: bytes => GetStatusRequest.fromBinary(bytes),
        responseSerialize: value => Buffer.from(Status.toBinary(value)),
        requestSerialize: value => Buffer.from(GetStatusRequest.toBinary(value))
    },
    getRouterConfig: {
        path: "/com.vector.ServerNodeService/GetRouterConfig",
        originalName: "GetRouterConfig",
        requestStream: false,
        responseStream: false,
        responseDeserialize: bytes => RouterConfig.fromBinary(bytes),
        requestDeserialize: bytes => GetRouterConfigRequest.fromBinary(bytes),
        responseSerialize: value => Buffer.from(RouterConfig.toBinary(value)),
        requestSerialize: value => Buffer.from(GetRouterConfigRequest.toBinary(value))
    },
    getChannelState: {
        path: "/com.vector.ServerNodeService/GetChannelState",
        originalName: "GetChannelState",
        requestStream: false,
        responseStream: false,
        responseDeserialize: bytes => FullChannelState.fromBinary(bytes),
        requestDeserialize: bytes => ChannelStateRequest.fromBinary(bytes),
        responseSerialize: value => Buffer.from(FullChannelState.toBinary(value)),
        requestSerialize: value => Buffer.from(ChannelStateRequest.toBinary(value))
    },
    getChannelStates: {
        path: "/com.vector.ServerNodeService/GetChannelStates",
        originalName: "GetChannelStates",
        requestStream: false,
        responseStream: false,
        responseDeserialize: bytes => FullChannelStates.fromBinary(bytes),
        requestDeserialize: bytes => Empty.fromBinary(bytes),
        responseSerialize: value => Buffer.from(FullChannelStates.toBinary(value)),
        requestSerialize: value => Buffer.from(Empty.toBinary(value))
    },
    getChannelStateByParticipants: {
        path: "/com.vector.ServerNodeService/GetChannelStateByParticipants",
        originalName: "GetChannelStateByParticipants",
        requestStream: false,
        responseStream: false,
        responseDeserialize: bytes => FullChannelState.fromBinary(bytes),
        requestDeserialize: bytes => ChannelStateByParticipantsRequest.fromBinary(bytes),
        responseSerialize: value => Buffer.from(FullChannelState.toBinary(value)),
        requestSerialize: value => Buffer.from(ChannelStateByParticipantsRequest.toBinary(value))
    },
    getTransferState: {
        path: "/com.vector.ServerNodeService/GetTransferState",
        originalName: "GetTransferState",
        requestStream: false,
        responseStream: false,
        responseDeserialize: bytes => FullTransferState.fromBinary(bytes),
        requestDeserialize: bytes => TransfersRequest.fromBinary(bytes),
        responseSerialize: value => Buffer.from(FullTransferState.toBinary(value)),
        requestSerialize: value => Buffer.from(TransfersRequest.toBinary(value))
    },
    getTransferStateByRoutingId: {
        path: "/com.vector.ServerNodeService/GetTransferStateByRoutingId",
        originalName: "GetTransferStateByRoutingId",
        requestStream: false,
        responseStream: false,
        responseDeserialize: bytes => FullTransferState.fromBinary(bytes),
        requestDeserialize: bytes => TransferStateByRoutingIdRequest.fromBinary(bytes),
        responseSerialize: value => Buffer.from(FullTransferState.toBinary(value)),
        requestSerialize: value => Buffer.from(TransferStateByRoutingIdRequest.toBinary(value))
    },
    getTransferStatesByRoutingId: {
        path: "/com.vector.ServerNodeService/GetTransferStatesByRoutingId",
        originalName: "GetTransferStatesByRoutingId",
        requestStream: false,
        responseStream: false,
        responseDeserialize: bytes => FullTransferStates.fromBinary(bytes),
        requestDeserialize: bytes => TransferStatesByRoutingIdRequest.fromBinary(bytes),
        responseSerialize: value => Buffer.from(FullTransferStates.toBinary(value)),
        requestSerialize: value => Buffer.from(TransferStatesByRoutingIdRequest.toBinary(value))
    },
    getActiveTransfers: {
        path: "/com.vector.ServerNodeService/GetActiveTransfers",
        originalName: "GetActiveTransfers",
        requestStream: false,
        responseStream: false,
        responseDeserialize: bytes => FullTransferStates.fromBinary(bytes),
        requestDeserialize: bytes => ActiveTransfersRequest.fromBinary(bytes),
        responseSerialize: value => Buffer.from(FullTransferStates.toBinary(value)),
        requestSerialize: value => Buffer.from(ActiveTransfersRequest.toBinary(value))
    },
    getRegisteredTransfers: {
        path: "/com.vector.ServerNodeService/GetRegisteredTransfers",
        originalName: "GetRegisteredTransfers",
        requestStream: false,
        responseStream: false,
        responseDeserialize: bytes => RegisteredTransfers.fromBinary(bytes),
        requestDeserialize: bytes => RegisteredTransfersRequest.fromBinary(bytes),
        responseSerialize: value => Buffer.from(RegisteredTransfers.toBinary(value)),
        requestSerialize: value => Buffer.from(RegisteredTransfersRequest.toBinary(value))
    },
    clearStore: {
        path: "/com.vector.ServerNodeService/ClearStore",
        originalName: "ClearStore",
        requestStream: false,
        responseStream: false,
        responseDeserialize: bytes => Empty.fromBinary(bytes),
        requestDeserialize: bytes => ClearStoreRequest.fromBinary(bytes),
        responseSerialize: value => Buffer.from(Empty.toBinary(value)),
        requestSerialize: value => Buffer.from(ClearStoreRequest.toBinary(value))
    },
    createNode: {
        path: "/com.vector.ServerNodeService/CreateNode",
        originalName: "CreateNode",
        requestStream: false,
        responseStream: false,
        responseDeserialize: bytes => CreateNodeReply.fromBinary(bytes),
        requestDeserialize: bytes => CreateNodeRequest.fromBinary(bytes),
        responseSerialize: value => Buffer.from(CreateNodeReply.toBinary(value)),
        requestSerialize: value => Buffer.from(CreateNodeRequest.toBinary(value))
    },
    setup: {
        path: "/com.vector.ServerNodeService/Setup",
        originalName: "Setup",
        requestStream: false,
        responseStream: false,
        responseDeserialize: bytes => FullChannelState.fromBinary(bytes),
        requestDeserialize: bytes => SetupRequest.fromBinary(bytes),
        responseSerialize: value => Buffer.from(FullChannelState.toBinary(value)),
        requestSerialize: value => Buffer.from(SetupRequest.toBinary(value))
    },
    internalSetup: {
        path: "/com.vector.ServerNodeService/InternalSetup",
        originalName: "InternalSetup",
        requestStream: false,
        responseStream: false,
        responseDeserialize: bytes => FullChannelState.fromBinary(bytes),
        requestDeserialize: bytes => SetupRequest.fromBinary(bytes),
        responseSerialize: value => Buffer.from(FullChannelState.toBinary(value)),
        requestSerialize: value => Buffer.from(SetupRequest.toBinary(value))
    },
    deposit: {
        path: "/com.vector.ServerNodeService/Deposit",
        originalName: "Deposit",
        requestStream: false,
        responseStream: false,
        responseDeserialize: bytes => FullChannelState.fromBinary(bytes),
        requestDeserialize: bytes => DepositRequest.fromBinary(bytes),
        responseSerialize: value => Buffer.from(FullChannelState.toBinary(value)),
        requestSerialize: value => Buffer.from(DepositRequest.toBinary(value))
    },
    sendDepositTx: {
        path: "/com.vector.ServerNodeService/SendDepositTx",
        originalName: "SendDepositTx",
        requestStream: false,
        responseStream: false,
        responseDeserialize: bytes => TxHash.fromBinary(bytes),
        requestDeserialize: bytes => DepositTxRequest.fromBinary(bytes),
        responseSerialize: value => Buffer.from(TxHash.toBinary(value)),
        requestSerialize: value => Buffer.from(DepositTxRequest.toBinary(value))
    },
    sendRequestCollateral: {
        path: "/com.vector.ServerNodeService/SendRequestCollateral",
        originalName: "SendRequestCollateral",
        requestStream: false,
        responseStream: false,
        responseDeserialize: bytes => FullChannelState.fromBinary(bytes),
        requestDeserialize: bytes => DepositRequest.fromBinary(bytes),
        responseSerialize: value => Buffer.from(FullChannelState.toBinary(value)),
        requestSerialize: value => Buffer.from(DepositRequest.toBinary(value))
    },
    createTransfer: {
        path: "/com.vector.ServerNodeService/CreateTransfer",
        originalName: "CreateTransfer",
        requestStream: false,
        responseStream: false,
        responseDeserialize: bytes => FullChannelState.fromBinary(bytes),
        requestDeserialize: bytes => ConditionalTransferRequest.fromBinary(bytes),
        responseSerialize: value => Buffer.from(FullChannelState.toBinary(value)),
        requestSerialize: value => Buffer.from(ConditionalTransferRequest.toBinary(value))
    },
    resolveTransfer: {
        path: "/com.vector.ServerNodeService/ResolveTransfer",
        originalName: "ResolveTransfer",
        requestStream: false,
        responseStream: false,
        responseDeserialize: bytes => FullChannelState.fromBinary(bytes),
        requestDeserialize: bytes => ResolveTransferRequest.fromBinary(bytes),
        responseSerialize: value => Buffer.from(FullChannelState.toBinary(value)),
        requestSerialize: value => Buffer.from(ResolveTransferRequest.toBinary(value))
    },
    withdraw: {
        path: "/com.vector.ServerNodeService/Withdraw",
        originalName: "Withdraw",
        requestStream: false,
        responseStream: false,
        responseDeserialize: bytes => FullChannelState.fromBinary(bytes),
        requestDeserialize: bytes => WithdrawRequest.fromBinary(bytes),
        responseSerialize: value => Buffer.from(FullChannelState.toBinary(value)),
        requestSerialize: value => Buffer.from(WithdrawRequest.toBinary(value))
    },
    restoreState: {
        path: "/com.vector.ServerNodeService/RestoreState",
        originalName: "RestoreState",
        requestStream: false,
        responseStream: false,
        responseDeserialize: bytes => FullChannelState.fromBinary(bytes),
        requestDeserialize: bytes => RestoreStateRequest.fromBinary(bytes),
        responseSerialize: value => Buffer.from(FullChannelState.toBinary(value)),
        requestSerialize: value => Buffer.from(RestoreStateRequest.toBinary(value))
    },
    sendDisputeChannelTx: {
        path: "/com.vector.ServerNodeService/SendDisputeChannelTx",
        originalName: "SendDisputeChannelTx",
        requestStream: false,
        responseStream: false,
        responseDeserialize: bytes => TxHash.fromBinary(bytes),
        requestDeserialize: bytes => ChannelStateRequest.fromBinary(bytes),
        responseSerialize: value => Buffer.from(TxHash.toBinary(value)),
        requestSerialize: value => Buffer.from(ChannelStateRequest.toBinary(value))
    },
    sendDefundChannelTx: {
        path: "/com.vector.ServerNodeService/SendDefundChannelTx",
        originalName: "SendDefundChannelTx",
        requestStream: false,
        responseStream: false,
        responseDeserialize: bytes => TxHash.fromBinary(bytes),
        requestDeserialize: bytes => ChannelStateRequest.fromBinary(bytes),
        responseSerialize: value => Buffer.from(TxHash.toBinary(value)),
        requestSerialize: value => Buffer.from(ChannelStateRequest.toBinary(value))
    },
    sendDisputeTransfer: {
        path: "/com.vector.ServerNodeService/SendDisputeTransfer",
        originalName: "SendDisputeTransfer",
        requestStream: false,
        responseStream: false,
        responseDeserialize: bytes => TxHash.fromBinary(bytes),
        requestDeserialize: bytes => TransferRequest.fromBinary(bytes),
        responseSerialize: value => Buffer.from(TxHash.toBinary(value)),
        requestSerialize: value => Buffer.from(TransferRequest.toBinary(value))
    },
    sendDefundTransfer: {
        path: "/com.vector.ServerNodeService/SendDefundTransfer",
        originalName: "SendDefundTransfer",
        requestStream: false,
        responseStream: false,
        responseDeserialize: bytes => TxHash.fromBinary(bytes),
        requestDeserialize: bytes => TransferRequest.fromBinary(bytes),
        responseSerialize: value => Buffer.from(TxHash.toBinary(value)),
        requestSerialize: value => Buffer.from(TransferRequest.toBinary(value))
    },
    isAliveStream: {
        path: "/com.vector.ServerNodeService/IsAliveStream",
        originalName: "IsAliveStream",
        requestStream: false,
        responseStream: true,
        responseDeserialize: bytes => IsAlivePayload.fromBinary(bytes),
        requestDeserialize: bytes => Empty.fromBinary(bytes),
        responseSerialize: value => Buffer.from(IsAlivePayload.toBinary(value)),
        requestSerialize: value => Buffer.from(Empty.toBinary(value))
    },
    setupStream: {
        path: "/com.vector.ServerNodeService/SetupStream",
        originalName: "SetupStream",
        requestStream: false,
        responseStream: true,
        responseDeserialize: bytes => SetupPayload.fromBinary(bytes),
        requestDeserialize: bytes => Empty.fromBinary(bytes),
        responseSerialize: value => Buffer.from(SetupPayload.toBinary(value)),
        requestSerialize: value => Buffer.from(Empty.toBinary(value))
    },
    conditionalTransferCreatedStream: {
        path: "/com.vector.ServerNodeService/ConditionalTransferCreatedStream",
        originalName: "ConditionalTransferCreatedStream",
        requestStream: false,
        responseStream: true,
        responseDeserialize: bytes => ConditionalTransferCreatedPayload.fromBinary(bytes),
        requestDeserialize: bytes => Empty.fromBinary(bytes),
        responseSerialize: value => Buffer.from(ConditionalTransferCreatedPayload.toBinary(value)),
        requestSerialize: value => Buffer.from(Empty.toBinary(value))
    },
    conditionalTransferResolvedStream: {
        path: "/com.vector.ServerNodeService/ConditionalTransferResolvedStream",
        originalName: "ConditionalTransferResolvedStream",
        requestStream: false,
        responseStream: true,
        responseDeserialize: bytes => ConditionalTransferCreatedPayload.fromBinary(bytes),
        requestDeserialize: bytes => Empty.fromBinary(bytes),
        responseSerialize: value => Buffer.from(ConditionalTransferCreatedPayload.toBinary(value)),
        requestSerialize: value => Buffer.from(Empty.toBinary(value))
    },
    depositReconciledStream: {
        path: "/com.vector.ServerNodeService/DepositReconciledStream",
        originalName: "DepositReconciledStream",
        requestStream: false,
        responseStream: true,
        responseDeserialize: bytes => DepositReconciledPayload.fromBinary(bytes),
        requestDeserialize: bytes => Empty.fromBinary(bytes),
        responseSerialize: value => Buffer.from(DepositReconciledPayload.toBinary(value)),
        requestSerialize: value => Buffer.from(Empty.toBinary(value))
    },
    requestCollateralStream: {
        path: "/com.vector.ServerNodeService/RequestCollateralStream",
        originalName: "RequestCollateralStream",
        requestStream: false,
        responseStream: true,
        responseDeserialize: bytes => RequestCollateralPayload.fromBinary(bytes),
        requestDeserialize: bytes => Empty.fromBinary(bytes),
        responseSerialize: value => Buffer.from(RequestCollateralPayload.toBinary(value)),
        requestSerialize: value => Buffer.from(Empty.toBinary(value))
    },
    withdrawalCreatedStream: {
        path: "/com.vector.ServerNodeService/WithdrawalCreatedStream",
        originalName: "WithdrawalCreatedStream",
        requestStream: false,
        responseStream: true,
        responseDeserialize: bytes => WithdrawalCreatedPayload.fromBinary(bytes),
        requestDeserialize: bytes => Empty.fromBinary(bytes),
        responseSerialize: value => Buffer.from(WithdrawalCreatedPayload.toBinary(value)),
        requestSerialize: value => Buffer.from(Empty.toBinary(value))
    },
    withdrawalResolvedStream: {
        path: "/com.vector.ServerNodeService/WithdrawalResolvedStream",
        originalName: "WithdrawalResolvedStream",
        requestStream: false,
        responseStream: true,
        responseDeserialize: bytes => WithdrawalCreatedPayload.fromBinary(bytes),
        requestDeserialize: bytes => Empty.fromBinary(bytes),
        responseSerialize: value => Buffer.from(WithdrawalCreatedPayload.toBinary(value)),
        requestSerialize: value => Buffer.from(Empty.toBinary(value))
    },
    withdrawalReconciledStream: {
        path: "/com.vector.ServerNodeService/WithdrawalReconciledStream",
        originalName: "WithdrawalReconciledStream",
        requestStream: false,
        responseStream: true,
        responseDeserialize: bytes => WithdrawalReconciledPayload.fromBinary(bytes),
        requestDeserialize: bytes => Empty.fromBinary(bytes),
        responseSerialize: value => Buffer.from(WithdrawalReconciledPayload.toBinary(value)),
        requestSerialize: value => Buffer.from(Empty.toBinary(value))
    },
    restoreStateStream: {
        path: "/com.vector.ServerNodeService/RestoreStateStream",
        originalName: "RestoreStateStream",
        requestStream: false,
        responseStream: true,
        responseDeserialize: bytes => SetupPayload.fromBinary(bytes),
        requestDeserialize: bytes => Empty.fromBinary(bytes),
        responseSerialize: value => Buffer.from(SetupPayload.toBinary(value)),
        requestSerialize: value => Buffer.from(Empty.toBinary(value))
    },
    ethProvider: {
        path: "/com.vector.ServerNodeService/EthProvider",
        originalName: "EthProvider",
        requestStream: false,
        responseStream: false,
        responseDeserialize: bytes => EthProviderReply.fromBinary(bytes),
        requestDeserialize: bytes => EthProviderRequest.fromBinary(bytes),
        responseSerialize: value => Buffer.from(EthProviderReply.toBinary(value)),
        requestSerialize: value => Buffer.from(EthProviderRequest.toBinary(value))
    }
};
