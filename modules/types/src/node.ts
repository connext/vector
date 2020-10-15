import { EngineEvent, EngineEventMap } from "./engine";
import { NodeError, Result } from "./error";
import { ServerNodeParams, ServerNodeResponses } from "./schemas";

// NOTE: This interface will also wrap server nodes that support only
// one channel (i.e. use a default index). This means that the interface
// function parameters do NOT match the REST API schemas, specifically
// due to the optional nature of the public identifier (MUST be supplied
// when using a multinode server-node, and does NOT need to be supplied
// when using a single-node server-node)
export interface INodeService {
  getStateChannelByParticipants(
    params: Omit<ServerNodeParams.GetChannelStateByParticipants, "publicIdentifier"> & { publicIdentifier?: string },
  ): Promise<Result<ServerNodeResponses.GetChannelStateByParticipants, NodeError>>;

  getStateChannels(
    params: Omit<ServerNodeParams.GetChannelStates, "publicIdentifier"> & { publicIdentifier?: string },
  ): Promise<Result<ServerNodeResponses.GetChannelStates, NodeError>>;

  getStateChannel(
    params: Omit<ServerNodeParams.GetChannelState, "publicIdentifier"> & { publicIdentifier?: string },
  ): Promise<Result<ServerNodeResponses.GetChannelState, NodeError>>;

  getTransferByRoutingId(
    params: Omit<ServerNodeParams.GetTransferStateByRoutingId, "publicIdentifier"> & { publicIdentifier?: string },
  ): Promise<Result<ServerNodeResponses.GetTransferStateByRoutingId, NodeError>>;

  getTransfersByRoutingId(
    params: Omit<ServerNodeParams.GetTransferStatesByRoutingId, "publicIdentifier"> & { publicIdentifier?: string },
  ): Promise<Result<ServerNodeResponses.GetTransferStatesByRoutingId, NodeError>>;

  getTransfer(
    params: Omit<ServerNodeParams.GetTransferState, "publicIdentifier"> & { publicIdentifier?: string },
  ): Promise<Result<ServerNodeResponses.GetTransferState, NodeError>>;

  getActiveTransfers(
    params: Omit<ServerNodeParams.GetActiveTransfersByChannelAddress, "publicIdentifier"> & {
      publicIdentifier?: string;
    },
  ): Promise<Result<ServerNodeResponses.GetActiveTransfersByChannelAddress, NodeError>>;

  createNode(params: ServerNodeParams.CreateNode): Promise<Result<ServerNodeResponses.CreateNode, NodeError>>;

  setup(
    params: Omit<ServerNodeParams.Setup, "publicIdentifier"> & { publicIdentifier?: string },
  ): Promise<Result<ServerNodeResponses.Setup, NodeError>>;

  requestSetup(params: ServerNodeParams.RequestSetup): Promise<Result<ServerNodeResponses.RequestSetup, NodeError>>;

  sendDepositTx(
    params: Omit<ServerNodeParams.SendDepositTx, "publicIdentifier"> & { publicIdentifier?: string },
  ): Promise<Result<ServerNodeResponses.SendDepositTx, NodeError>>;

  reconcileDeposit(
    params: Omit<ServerNodeParams.Deposit, "publicIdentifier"> & { publicIdentifier?: string },
  ): Promise<Result<ServerNodeResponses.Deposit, NodeError>>;

  conditionalTransfer(
    params: Omit<ServerNodeParams.ConditionalTransfer, "publicIdentifier"> & { publicIdentifier?: string },
  ): Promise<Result<ServerNodeResponses.ConditionalTransfer, NodeError>>;

  resolveTransfer(
    params: Omit<ServerNodeParams.ResolveTransfer, "publicIdentifier"> & { publicIdentifier?: string },
  ): Promise<Result<ServerNodeResponses.ResolveTransfer, NodeError>>;

  withdraw(
    params: Omit<ServerNodeParams.Withdraw, "publicIdentifier"> & { publicIdentifier?: string },
  ): Promise<Result<ServerNodeResponses.Withdraw, NodeError>>;

  once<T extends EngineEvent>(
    event: T,
    callback: (payload: EngineEventMap[T]) => void | Promise<void>,
    filter?: (payload: EngineEventMap[T]) => boolean,
  ): Promise<void>;

  on<T extends EngineEvent>(
    event: T,
    callback: (payload: EngineEventMap[T]) => void | Promise<void>,
    filter?: (payload: EngineEventMap[T]) => boolean,
  ): Promise<void>;

  off<T extends EngineEvent>(event: T): Promise<void>;

  waitFor<T extends EngineEvent>(
    event: T,
    timeout: number,
    filter?: (payload: EngineEventMap[T]) => boolean,
  ): Promise<EngineEventMap[T] | undefined>;
}
