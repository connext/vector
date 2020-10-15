import { EngineEvent, EngineEventMap } from "./engine";
import { NodeError, Result } from "./error";
import { ServerNodeParams, ServerNodeResponses } from "./schemas";

// NOTE: This interface will also wrap server nodes that support a default
// publicIdentifier (i.e. use a default index). This means that the interface
// function parameters do NOT match the REST API schemas, specifically
// due to the optional nature of the public identifier (MUST be supplied
// when using a multinode server-node, and does NOT need to be supplied
// when using a single-node server-node)

export type OptionalPublicIdentifier<T> = Omit<T, "publicIdentifier"> & { publicIdentifier?: string };

export interface INodeService {
  getStateChannelByParticipants(
    params: OptionalPublicIdentifier<ServerNodeParams.GetChannelStateByParticipants>,
  ): Promise<Result<ServerNodeResponses.GetChannelStateByParticipants, NodeError>>;

  getStateChannels(
    params: OptionalPublicIdentifier<ServerNodeParams.GetChannelStates>,
  ): Promise<Result<ServerNodeResponses.GetChannelStates, NodeError>>;

  getStateChannel(
    params: OptionalPublicIdentifier<ServerNodeParams.GetChannelState>,
  ): Promise<Result<ServerNodeResponses.GetChannelState, NodeError>>;

  getTransferByRoutingId(
    params: OptionalPublicIdentifier<ServerNodeParams.GetTransferStateByRoutingId>,
  ): Promise<Result<ServerNodeResponses.GetTransferStateByRoutingId, NodeError>>;

  getTransfersByRoutingId(
    params: OptionalPublicIdentifier<ServerNodeParams.GetTransferStatesByRoutingId>,
  ): Promise<Result<ServerNodeResponses.GetTransferStatesByRoutingId, NodeError>>;

  getTransfer(
    params: OptionalPublicIdentifier<ServerNodeParams.GetTransferState>,
  ): Promise<Result<ServerNodeResponses.GetTransferState, NodeError>>;

  getActiveTransfers(
    params: OptionalPublicIdentifier<ServerNodeParams.GetActiveTransfersByChannelAddress>,
  ): Promise<Result<ServerNodeResponses.GetActiveTransfersByChannelAddress, NodeError>>;

  createNode(params: ServerNodeParams.CreateNode): Promise<Result<ServerNodeResponses.CreateNode, NodeError>>;

  setup(
    params: OptionalPublicIdentifier<ServerNodeParams.Setup>,
  ): Promise<Result<ServerNodeResponses.Setup, NodeError>>;

  requestSetup(params: ServerNodeParams.RequestSetup): Promise<Result<ServerNodeResponses.RequestSetup, NodeError>>;

  sendDepositTx(
    params: OptionalPublicIdentifier<ServerNodeParams.SendDepositTx>,
  ): Promise<Result<ServerNodeResponses.SendDepositTx, NodeError>>;

  reconcileDeposit(
    params: OptionalPublicIdentifier<ServerNodeParams.Deposit>,
  ): Promise<Result<ServerNodeResponses.Deposit, NodeError>>;

  conditionalTransfer(
    params: OptionalPublicIdentifier<ServerNodeParams.ConditionalTransfer>,
  ): Promise<Result<ServerNodeResponses.ConditionalTransfer, NodeError>>;

  resolveTransfer(
    params: OptionalPublicIdentifier<ServerNodeParams.ResolveTransfer>,
  ): Promise<Result<ServerNodeResponses.ResolveTransfer, NodeError>>;

  withdraw(
    params: OptionalPublicIdentifier<ServerNodeParams.Withdraw>,
  ): Promise<Result<ServerNodeResponses.Withdraw, NodeError>>;

  once<T extends EngineEvent>(
    event: T,
    callback: (payload: EngineEventMap[T]) => void | Promise<void>,
    filter?: (payload: EngineEventMap[T]) => boolean,
    publicIdentifier?: string,
  ): Promise<void>;

  on<T extends EngineEvent>(
    event: T,
    callback: (payload: EngineEventMap[T]) => void | Promise<void>,
    filter?: (payload: EngineEventMap[T]) => boolean,
    publicIdentifier?: string,
  ): Promise<void>;

  off<T extends EngineEvent>(event: T, publicIdentifier?: string): Promise<void>;

  waitFor<T extends EngineEvent>(
    event: T,
    timeout: number,
    filter?: (payload: EngineEventMap[T]) => boolean,
    publicIdentifier?: string,
  ): Promise<EngineEventMap[T] | undefined>;
}
