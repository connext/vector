import { EngineEvent, EngineEventMap } from "./engine";
import { NodeError, Result } from "./error";
import { NodeParams, NodeResponses } from "./schemas";

// NOTE: This interface will also wrap server nodes that support a default
// publicIdentifier (i.e. use a default index). This means that the interface
// function parameters do NOT match the REST API schemas, specifically
// due to the optional nature of the public identifier (MUST be supplied
// when using a multinode server-node, and does NOT need to be supplied
// when using a single-node server-node)

export type OptionalPublicIdentifier<T> = Omit<T, "publicIdentifier"> & { publicIdentifier?: string };

export interface INodeService {
  publicIdentifier: string;
  signerAddress: string;

  getStatus(): Promise<Result<NodeResponses.GetStatus, NodeError>>;

  getStateChannelByParticipants(
    params: OptionalPublicIdentifier<NodeParams.GetChannelStateByParticipants>,
  ): Promise<Result<NodeResponses.GetChannelStateByParticipants, NodeError>>;

  getStateChannels(
    params: OptionalPublicIdentifier<NodeParams.GetChannelStates>,
  ): Promise<Result<NodeResponses.GetChannelStates, NodeError>>;

  getStateChannel(
    params: OptionalPublicIdentifier<NodeParams.GetChannelState>,
  ): Promise<Result<NodeResponses.GetChannelState, NodeError>>;

  getTransferByRoutingId(
    params: OptionalPublicIdentifier<NodeParams.GetTransferStateByRoutingId>,
  ): Promise<Result<NodeResponses.GetTransferStateByRoutingId, NodeError>>;

  getTransfersByRoutingId(
    params: OptionalPublicIdentifier<NodeParams.GetTransferStatesByRoutingId>,
  ): Promise<Result<NodeResponses.GetTransferStatesByRoutingId, NodeError>>;

  getTransfer(
    params: OptionalPublicIdentifier<NodeParams.GetTransferState>,
  ): Promise<Result<NodeResponses.GetTransferState, NodeError>>;

  getActiveTransfers(
    params: OptionalPublicIdentifier<NodeParams.GetActiveTransfersByChannelAddress>,
  ): Promise<Result<NodeResponses.GetActiveTransfersByChannelAddress, NodeError>>;

  getRegisteredTransfers(
    params: OptionalPublicIdentifier<NodeParams.GetRegisteredTransfers>,
  ): Promise<Result<NodeResponses.GetRegisteredTransfers, NodeError>>;

  createNode(params: NodeParams.CreateNode): Promise<Result<NodeResponses.CreateNode, NodeError>>;

  setup(
    params: OptionalPublicIdentifier<NodeParams.RequestSetup>,
  ): Promise<Result<NodeResponses.RequestSetup, NodeError>>;

  internalSetup(params: OptionalPublicIdentifier<NodeParams.Setup>): Promise<Result<NodeResponses.Setup, NodeError>>;

  sendDepositTx(
    params: OptionalPublicIdentifier<NodeParams.SendDepositTx>,
  ): Promise<Result<NodeResponses.SendDepositTx, NodeError>>;

  reconcileDeposit(
    params: OptionalPublicIdentifier<NodeParams.Deposit>,
  ): Promise<Result<NodeResponses.Deposit, NodeError>>;

  requestCollateral(
    params: OptionalPublicIdentifier<NodeParams.RequestCollateral>,
  ): Promise<Result<NodeResponses.RequestCollateral, NodeError>>;

  conditionalTransfer(
    params: OptionalPublicIdentifier<NodeParams.ConditionalTransfer>,
  ): Promise<Result<NodeResponses.ConditionalTransfer, NodeError>>;

  resolveTransfer(
    params: OptionalPublicIdentifier<NodeParams.ResolveTransfer>,
  ): Promise<Result<NodeResponses.ResolveTransfer, NodeError>>;

  // Dispute methods
  sendDisputeChannelTx(
    params: OptionalPublicIdentifier<NodeParams.SendDisputeChannelTx>,
  ): Promise<Result<NodeResponses.SendDisputeChannelTx, NodeError>>;

  sendDefundChannelTx(
    params: OptionalPublicIdentifier<NodeParams.SendDefundChannelTx>,
  ): Promise<Result<NodeResponses.SendDefundChannelTx, NodeError>>;

  sendDisputeTransferTx(
    params: OptionalPublicIdentifier<NodeParams.SendDisputeTransferTx>,
  ): Promise<Result<NodeResponses.SendDisputeTransferTx, NodeError>>;

  sendDefundTransferTx(
    params: OptionalPublicIdentifier<NodeParams.SendDefundTransferTx>,
  ): Promise<Result<NodeResponses.SendDefundTransferTx, NodeError>>;

  withdraw(params: OptionalPublicIdentifier<NodeParams.Withdraw>): Promise<Result<NodeResponses.Withdraw, NodeError>>;

  once<T extends EngineEvent>(
    event: T,
    callback: (payload: EngineEventMap[T]) => void | Promise<void>,
    filter?: (payload: EngineEventMap[T]) => boolean,
    publicIdentifier?: string,
  ): void;

  on<T extends EngineEvent>(
    event: T,
    callback: (payload: EngineEventMap[T]) => void | Promise<void>,
    filter?: (payload: EngineEventMap[T]) => boolean,
    publicIdentifier?: string,
  ): void;

  off<T extends EngineEvent>(event: T, publicIdentifier?: string): void;

  waitFor<T extends EngineEvent>(
    event: T,
    timeout: number,
    filter?: (payload: EngineEventMap[T]) => boolean,
    publicIdentifier?: string,
  ): Promise<EngineEventMap[T] | undefined>;
}
