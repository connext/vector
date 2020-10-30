import { VectorChainService } from "@connext/vector-contracts";
import { VectorEngine } from "@connext/vector-engine";
import {
  ChainAddresses,
  ChainProviders,
  ChannelRpcMethods,
  CreateUpdateDetails,
  EngineEvent,
  EngineEventMap,
  IChannelSigner,
  INodeService,
  IVectorChainService,
  IVectorEngine,
  NodeError,
  OptionalPublicIdentifier,
  Result,
  NodeParams,
  NodeResponses,
} from "@connext/vector-types";
import {
  bufferify,
  constructRpcRequest,
  hydrateProviders,
  NatsMessagingService,
  hashCoreTransferState,
} from "@connext/vector-utils";
import { MerkleTree } from "merkletreejs";
import { BaseLogger } from "pino";

import { BrowserStore } from "./services/store";
import { BrowserLockService } from "./services/lock";
import { utils } from "ethers";

export type BrowserNodeConfig = {
  natsUrl?: string;
  authUrl?: string;
  messagingUrl?: string;
  logger: BaseLogger;
  signer: IChannelSigner;
  chainProviders: ChainProviders;
  chainAddresses: ChainAddresses;
};

export class BrowserNode implements INodeService {
  private constructor(private readonly engine: IVectorEngine, private readonly chainService: IVectorChainService) {}

  static async connect(config: BrowserNodeConfig): Promise<BrowserNode> {
    const chainJsonProviders = hydrateProviders(config.chainProviders);
    const messaging = new NatsMessagingService({
      logger: config.logger.child({ module: "MessagingService" }),
      messagingUrl: config.messagingUrl,
      natsUrl: config.natsUrl,
      authUrl: config.authUrl,
      signer: config.signer,
    });
    await messaging.connect();
    const store = new BrowserStore(config.logger.child({ module: "BrowserStore" }));
    const lock = new BrowserLockService(
      config.signer.publicIdentifier,
      messaging,
      config.logger.child({ module: "BrowserLockService" }),
    );
    const chainService = new VectorChainService(
      store,
      chainJsonProviders,
      config.signer,
      config.logger.child({ module: "VectorChainService" }),
    );
    const engine = await VectorEngine.connect(
      messaging,
      lock,
      store,
      config.signer,
      chainService,
      config.chainAddresses,
      config.logger.child({ module: "VectorEngine" }),
    );
    const node = new BrowserNode(engine, chainService);
    return node;
  }

  get publicIdentifier(): string {
    return this.engine.publicIdentifier;
  }

  get signerAddress(): string {
    return this.engine.signerAddress;
  }

  createNode(params: NodeParams.CreateNode): Promise<Result<NodeResponses.CreateNode, NodeError>> {
    return Promise.resolve(Result.fail(new NodeError(NodeError.reasons.MultinodeProhibitted, { params })));
  }

  async getStateChannelByParticipants(
    params: OptionalPublicIdentifier<NodeParams.GetChannelStateByParticipants>,
  ): Promise<Result<NodeResponses.GetChannelStateByParticipants, NodeError>> {
    const rpc = constructRpcRequest(ChannelRpcMethods.chan_getChannelStateByParticipants, {
      alice: params.counterparty,
      bob: this.publicIdentifier,
      chainId: params.chainId,
    });
    try {
      const res = await this.engine.request<typeof ChannelRpcMethods.chan_getChannelStateByParticipants>(rpc);
      return Result.ok(res);
    } catch (e) {
      return Result.fail(e);
    }
  }

  async getStateChannel(
    params: OptionalPublicIdentifier<NodeParams.GetChannelState>,
  ): Promise<Result<NodeResponses.GetChannelState, NodeError>> {
    const rpc = constructRpcRequest(ChannelRpcMethods.chan_getChannelState, params);
    try {
      const res = await this.engine.request<typeof ChannelRpcMethods.chan_getChannelState>(rpc);
      return Result.ok(res);
    } catch (e) {
      return Result.fail(e);
    }
  }

  async getStateChannels(): Promise<Result<NodeResponses.GetChannelStates, NodeError>> {
    const rpc = constructRpcRequest(ChannelRpcMethods.chan_getChannelStates, undefined);
    try {
      const res = await this.engine.request<typeof ChannelRpcMethods.chan_getChannelStates>(rpc);
      return Result.ok(res.map(chan => chan.channelAddress));
    } catch (e) {
      return Result.fail(e);
    }
  }

  async getTransferByRoutingId(
    params: OptionalPublicIdentifier<NodeParams.GetTransferStateByRoutingId>,
  ): Promise<Result<NodeResponses.GetTransferStateByRoutingId, NodeError>> {
    const rpc = constructRpcRequest(ChannelRpcMethods.chan_getTransferStateByRoutingId, params);
    try {
      const res = await this.engine.request<typeof ChannelRpcMethods.chan_getTransferStateByRoutingId>(rpc);
      return Result.ok(res);
    } catch (e) {
      return Result.fail(e);
    }
  }

  async getTransfersByRoutingId(
    params: OptionalPublicIdentifier<NodeParams.GetTransferStatesByRoutingId>,
  ): Promise<Result<NodeResponses.GetTransferStatesByRoutingId, NodeError>> {
    const rpc = constructRpcRequest(ChannelRpcMethods.chan_getTransferStatesByRoutingId, params);
    try {
      const res = await this.engine.request<typeof ChannelRpcMethods.chan_getTransferStatesByRoutingId>(rpc);
      return Result.ok(res as NodeResponses.GetTransferStatesByRoutingId);
    } catch (e) {
      return Result.fail(e);
    }
  }

  async getTransfer(
    params: OptionalPublicIdentifier<NodeParams.GetTransferState>,
  ): Promise<Result<NodeResponses.GetTransferState, NodeError>> {
    const rpc = constructRpcRequest(ChannelRpcMethods.chan_getTransferState, params);
    try {
      const res = await this.engine.request<typeof ChannelRpcMethods.chan_getTransferState>(rpc);
      return Result.ok(res);
    } catch (e) {
      return Result.fail(e);
    }
  }

  async getActiveTransfers(
    params: OptionalPublicIdentifier<NodeParams.GetActiveTransfersByChannelAddress>,
  ): Promise<Result<NodeResponses.GetActiveTransfersByChannelAddress, NodeError>> {
    const rpc = constructRpcRequest(ChannelRpcMethods.chan_getActiveTransfers, params);
    try {
      const res = await this.engine.request<typeof ChannelRpcMethods.chan_getActiveTransfers>(rpc);
      return Result.ok(res);
    } catch (e) {
      return Result.fail(e);
    }
  }

  async setup(
    params: OptionalPublicIdentifier<NodeParams.RequestSetup>,
  ): Promise<Result<NodeResponses.RequestSetup, NodeError>> {
    const rpc = constructRpcRequest(ChannelRpcMethods.chan_requestSetup, params);
    try {
      const res = await this.engine.request<typeof ChannelRpcMethods.chan_requestSetup>(rpc);
      return Result.ok(res);
    } catch (e) {
      return Result.fail(e);
    }
  }

  // OK to leave unimplemented since browser node will never be Alice
  async internalSetup(): Promise<Result<NodeResponses.Setup, NodeError>> {
    throw new Error("Method not implemented");
  }

  // OK to leave unimplemented since all txes can be sent from outside the browser node
  async sendDepositTx(): Promise<Result<NodeResponses.SendDepositTx, NodeError>> {
    throw new Error("Method not implemented.");
  }

  async reconcileDeposit(
    params: OptionalPublicIdentifier<NodeParams.Deposit>,
  ): Promise<Result<NodeResponses.Deposit, NodeError>> {
    const rpc = constructRpcRequest(ChannelRpcMethods.chan_deposit, params);
    try {
      const res = await this.engine.request<typeof ChannelRpcMethods.chan_deposit>(rpc);
      return Result.ok({ channelAddress: res.channelAddress });
    } catch (e) {
      return Result.fail(e);
    }
  }

  async requestCollateral(
    params: OptionalPublicIdentifier<NodeParams.RequestCollateral>,
  ): Promise<Result<NodeResponses.RequestCollateral, NodeError>> {
    const rpc = constructRpcRequest(ChannelRpcMethods.chan_requestCollateral, params);
    try {
      await this.engine.request<typeof ChannelRpcMethods.chan_requestCollateral>(rpc);
      return Result.ok({ channelAddress: params.channelAddress });
    } catch (e) {
      return Result.fail(e);
    }
  }

  async conditionalTransfer(
    params: OptionalPublicIdentifier<NodeParams.ConditionalTransfer>,
  ): Promise<Result<NodeResponses.ConditionalTransfer, NodeError>> {
    const rpc = constructRpcRequest(ChannelRpcMethods.chan_createTransfer, params);
    try {
      const res = await this.engine.request<typeof ChannelRpcMethods.chan_createTransfer>(rpc);
      return Result.ok({
        channelAddress: res.channelAddress,
        transferId: (res.latestUpdate.details as CreateUpdateDetails).transferId,
        routingId: (res.latestUpdate.details as CreateUpdateDetails).meta?.routingId,
      });
    } catch (e) {
      return Result.fail(e);
    }
  }

  async resolveTransfer(
    params: OptionalPublicIdentifier<NodeParams.ResolveTransfer>,
  ): Promise<Result<NodeResponses.ResolveTransfer, NodeError>> {
    const rpc = constructRpcRequest(ChannelRpcMethods.chan_resolveTransfer, params);
    try {
      const res = await this.engine.request<typeof ChannelRpcMethods.chan_resolveTransfer>(rpc);
      return Result.ok({
        channelAddress: res.channelAddress,
        transferId: (res.latestUpdate.details as CreateUpdateDetails).transferId,
        routingId: (res.latestUpdate.details as CreateUpdateDetails).meta?.routingId,
      });
    } catch (e) {
      return Result.fail(e);
    }
  }

  async withdraw(
    params: OptionalPublicIdentifier<NodeParams.Withdraw>,
  ): Promise<Result<NodeResponses.Withdraw, NodeError>> {
    const rpc = constructRpcRequest(ChannelRpcMethods.chan_withdraw, params);
    try {
      const res = await this.engine.request<typeof ChannelRpcMethods.chan_withdraw>(rpc);
      return Result.ok({
        channelAddress: res.channel.channelAddress,
        transferId: (res.channel.latestUpdate.details as CreateUpdateDetails).transferId,
        transactionHash: res.transactionHash,
      });
    } catch (e) {
      return Result.fail(e);
    }
  }

  //////////////////////
  /// DISPUTE METHODS
  async sendDisputeChannelTx(
    params: OptionalPublicIdentifier<ServerNodeParams.SendDisputeChannelTx>,
  ): Promise<Result<ServerNodeResponses.SendDisputeChannelTx, NodeError>> {
    const channelRes = await this.getStateChannel(params);
    if (!channelRes.isError) {
      return Result.fail(channelRes.getError()!);
    }
    const channel = channelRes.getValue();
    if (!channel) {
      return Result.fail(new NodeError(NodeError.reasons.ChannelNotFound, params));
    }
    const disputeRes = await this.chainService.sendDisputeChannelTx(channel);
    if (disputeRes.isError) {
      return Result.fail(disputeRes.getError()! as any);
    }
    return Result.ok({ txHash: disputeRes.getValue().hash });
  }

  async sendDefundChannelTx(
    params: OptionalPublicIdentifier<ServerNodeParams.SendDefundChannelTx>,
  ): Promise<Result<ServerNodeResponses.SendDefundChannelTx, NodeError>> {
    const channelRes = await this.getStateChannel(params);
    if (!channelRes.isError) {
      return Result.fail(channelRes.getError()!);
    }
    const channel = channelRes.getValue();
    if (!channel) {
      return Result.fail(new NodeError(NodeError.reasons.ChannelNotFound, params));
    }
    const defundRes = await this.chainService.sendDefundChannelTx(channel);
    if (defundRes.isError) {
      return Result.fail(defundRes.getError()! as any);
    }
    return Result.ok({ txHash: defundRes.getValue().hash });
  }

  async sendDisputeTransferTx(
    params: OptionalPublicIdentifier<ServerNodeParams.SendDisputeTransferTx>,
  ): Promise<Result<ServerNodeResponses.SendDisputeTransferTx, NodeError>> {
    const transferRes = await this.getTransfer(params);
    if (!transferRes.isError) {
      return Result.fail(transferRes.getError()!);
    }
    const transfer = transferRes.getValue();
    if (!transfer) {
      return Result.fail(new NodeError(NodeError.reasons.TransferNotFound, params));
    }
    const activeTransferRes = await this.getActiveTransfers({
      channelAddress: transfer.chainAddress,
      publicIdentifier: this.publicIdentifier,
    });
    if (activeTransferRes.isError) {
      return Result.fail(activeTransferRes.getError()!);
    }
    const active = activeTransferRes.getValue();
    if (!active.find(t => t.transferId === transfer.transferId)) {
      return Result.fail(new NodeError(NodeError.reasons.TransferNotActive, params));
    }

    // Generate merkle proof
    const hashes = active.map(t => bufferify(hashCoreTransferState(t)));
    const hash = bufferify(hashCoreTransferState(transfer));
    const merkle = new MerkleTree(hashes, utils.keccak256);

    const disputeRes = await this.chainService.sendDisputeTransferTx(transfer, merkle.getHexProof(hash));

    if (disputeRes.isError) {
      return Result.fail(disputeRes.getError()! as any);
    }
    return Result.ok({ txHash: disputeRes.getValue().hash });
  }

  async sendDefundTransferTx(
    params: OptionalPublicIdentifier<ServerNodeParams.SendDefundTransferTx>,
  ): Promise<Result<ServerNodeResponses.SendDefundTransferTx, NodeError>> {
    const transferRes = await this.getTransfer(params);
    if (!transferRes.isError) {
      return Result.fail(transferRes.getError()!);
    }
    const transfer = transferRes.getValue();
    if (!transfer) {
      return Result.fail(new NodeError(NodeError.reasons.TransferNotFound));
    }
    const defundRes = await this.chainService.sendDefundTransferTx(transfer);
    if (defundRes.isError) {
      return Result.fail(defundRes.getError()! as any);
    }
    return Result.ok({ txHash: defundRes.getValue().hash });
  }

  waitFor<T extends EngineEvent>(
    event: T,
    timeout: number,
    filter?: (payload: EngineEventMap[T]) => boolean,
  ): Promise<EngineEventMap[T] | undefined> {
    return this.engine.waitFor(event, timeout, filter);
  }

  async once<T extends EngineEvent>(
    event: T,
    callback: (payload: EngineEventMap[T]) => void | Promise<void>,
    filter?: (payload: EngineEventMap[T]) => boolean,
  ): Promise<void> {
    return this.engine.once(event, callback, filter);
  }

  async on<T extends EngineEvent>(
    event: T,
    callback: (payload: EngineEventMap[T]) => void | Promise<void>,
    filter?: (payload: EngineEventMap[T]) => boolean,
  ): Promise<void> {
    return this.engine.on(event, callback, filter);
  }

  async off<T extends EngineEvent>(event: T): Promise<void> {
    return this.engine.off(event);
  }
}
