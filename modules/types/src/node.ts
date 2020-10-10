import { EngineEvent, EngineEventMap } from "./engine";
import { NodeError, Result } from "./error";
import { ServerNodeParams, ServerNodeResponses } from "./schemas";

export interface INodeService {
  getStateChannelByParticipants(
    params: ServerNodeParams.GetChannelStateByParticipants,
  ): Promise<Result<ServerNodeResponses.GetChannelStateByParticipants, NodeError>>;

  getStateChannels(
    params?: ServerNodeParams.GetChannelStates,
  ): Promise<Result<ServerNodeResponses.GetChannelStates, NodeError>>;

  getStateChannel(
    params: ServerNodeParams.GetChannelState,
  ): Promise<Result<ServerNodeResponses.GetChannelState, NodeError>>;

  getTransferByRoutingId(
    params: ServerNodeParams.GetTransferStateByRoutingId,
  ): Promise<Result<ServerNodeResponses.GetTransferStateByRoutingId, NodeError>>;

  getTransfersByRoutingId(
    params: ServerNodeParams.GetTransferStatesByRoutingId,
  ): Promise<Result<ServerNodeResponses.GetTransferStatesByRoutingId, NodeError>>;

  setup(params: ServerNodeParams.Setup): Promise<Result<ServerNodeResponses.Setup, NodeError>>;

  requestSetup(params: ServerNodeParams.RequestSetup): Promise<Result<ServerNodeResponses.RequestSetup, NodeError>>;

  sendDepositTx(params: ServerNodeParams.SendDepositTx): Promise<Result<ServerNodeResponses.SendDepositTx, NodeError>>;

  reconcileDeposit(params: ServerNodeParams.Deposit): Promise<Result<ServerNodeResponses.Deposit, NodeError>>;

  conditionalTransfer(
    params: ServerNodeParams.ConditionalTransfer,
  ): Promise<Result<ServerNodeResponses.ConditionalTransfer, NodeError>>;

  resolveTransfer(
    params: ServerNodeParams.ResolveTransfer,
  ): Promise<Result<ServerNodeResponses.ResolveTransfer, NodeError>>;

  withdraw(params: ServerNodeParams.Withdraw): Promise<Result<ServerNodeResponses.Withdraw, NodeError>>;

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
