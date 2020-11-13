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
  ChannelRpcMethod,
  ChannelRpcMethodsPayloadMap,
  ChannelRpcMethodsResponsesMap,
  JsonRpcRequest,
  EngineParams,
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
import { utils } from "ethers";

import { BrowserStore } from "./services/store";
import { BrowserLockService } from "./services/lock";
import { DirectProvider, IframeChannelProvider, IRpcChannelProvider } from "./channelProvider";

export type BrowserNodeConfig = {
  natsUrl?: string;
  authUrl?: string;
  messagingUrl?: string;
  logger: BaseLogger;
  signer?: IChannelSigner;
  chainProviders?: ChainProviders;
  chainAddresses?: ChainAddresses;
  iframeSrc?: string;
};

export type BrowserNodeOpts = {
  engine?: IVectorEngine;
  chainService?: IVectorChainService;
  iframeSrc?: string;
};

export class BrowserNode implements INodeService {
  private channelProvider: IRpcChannelProvider;
  private constructor({ engine, iframeSrc }: BrowserNodeOpts) {
    if (engine) {
      this.channelProvider = new DirectProvider(engine);
    } else {
      this.channelProvider = new IframeChannelProvider({
        src: iframeSrc!,
        id: "connext-iframe",
      });
    }
  }

  static async connect(config: BrowserNodeConfig): Promise<BrowserNode> {
    let node: BrowserNode;
    if (config.signer) {
      config.logger.info({ method: "connect" }, "Connecting with provided signer");
      const chainJsonProviders = hydrateProviders(config.chainProviders!);
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
        config.chainAddresses!,
        config.logger.child({ module: "VectorEngine" }),
      );
      node = new BrowserNode({ engine, chainService });
    } else {
      let iframeSrc = config.iframeSrc;
      if (!config.iframeSrc) {
        iframeSrc = "https://wallet.connext.network";
      }
      config.logger.info({ method: "connect", iframeSrc }, "Connecting with iframe provider");
      node = new BrowserNode({ iframeSrc });
    }
    return node;
  }

  get publicIdentifier(): string {
    return "";
    // return this.engine.publicIdentifier;
  }

  get signerAddress(): string {
    return "";
    // return this.engine.signerAddress;
  }

  createNode(params: NodeParams.CreateNode): Promise<Result<NodeResponses.CreateNode, NodeError>> {
    return Promise.resolve(Result.fail(new NodeError(NodeError.reasons.MultinodeProhibitted, { params })));
  }

  async getStateChannelByParticipants(
    params: OptionalPublicIdentifier<NodeParams.GetChannelStateByParticipants>,
  ): Promise<Result<NodeResponses.GetChannelStateByParticipants, NodeError>> {
    try {
      const rpc = constructRpcRequest<"chan_getChannelStateByParticipants">(
        ChannelRpcMethods.chan_getChannelStateByParticipants,
        {
          alice: params.counterparty,
          bob: this.publicIdentifier,
          chainId: params.chainId,
        },
      );
      const res = await this.channelProvider.send(rpc);
      return Result.ok(res);
    } catch (e) {
      return Result.fail(e);
    }
  }

  async getStateChannel(
    params: OptionalPublicIdentifier<NodeParams.GetChannelState>,
  ): Promise<Result<NodeResponses.GetChannelState, NodeError>> {
    try {
      const rpc = constructRpcRequest<"chan_getChannelState">(ChannelRpcMethods.chan_getChannelState, params);
      const res = await this.channelProvider.send(rpc);
      return Result.ok(res);
    } catch (e) {
      return Result.fail(e);
    }
  }

  async getStateChannels(): Promise<Result<NodeResponses.GetChannelStates, NodeError>> {
    try {
      const rpc = constructRpcRequest<"chan_getChannelStates">(ChannelRpcMethods.chan_getChannelStates, undefined);
      const res = await this.channelProvider.send(rpc);
      return Result.ok(res.map(chan => chan.channelAddress));
    } catch (e) {
      return Result.fail(e);
    }
  }

  async getTransferByRoutingId(
    params: OptionalPublicIdentifier<NodeParams.GetTransferStateByRoutingId>,
  ): Promise<Result<NodeResponses.GetTransferStateByRoutingId, NodeError>> {
    try {
      const rpc = constructRpcRequest<"chan_getTransferStateByRoutingId">(
        ChannelRpcMethods.chan_getTransferStateByRoutingId,
        params,
      );
      const res = await this.channelProvider.send(rpc);
      return Result.ok(res);
    } catch (e) {
      return Result.fail(e);
    }
  }

  async getTransfersByRoutingId(
    params: OptionalPublicIdentifier<NodeParams.GetTransferStatesByRoutingId>,
  ): Promise<Result<NodeResponses.GetTransferStatesByRoutingId, NodeError>> {
    try {
      const rpc = constructRpcRequest<"chan_getTransferStatesByRoutingId">(
        ChannelRpcMethods.chan_getTransferStatesByRoutingId,
        params,
      );
      const res = await this.channelProvider.send(rpc);
      return Result.ok(res as NodeResponses.GetTransferStatesByRoutingId);
    } catch (e) {
      return Result.fail(e);
    }
  }

  async getTransfer(
    params: OptionalPublicIdentifier<NodeParams.GetTransferState>,
  ): Promise<Result<NodeResponses.GetTransferState, NodeError>> {
    try {
      const rpc = constructRpcRequest<"chan_getTransferState">(ChannelRpcMethods.chan_getTransferState, params);
      const res = await this.channelProvider.send(rpc);
      return Result.ok(res);
    } catch (e) {
      return Result.fail(e);
    }
  }

  async getActiveTransfers(
    params: OptionalPublicIdentifier<NodeParams.GetActiveTransfersByChannelAddress>,
  ): Promise<Result<NodeResponses.GetActiveTransfersByChannelAddress, NodeError>> {
    try {
      const rpc = constructRpcRequest<"chan_getActiveTransfers">(ChannelRpcMethods.chan_getActiveTransfers, params);
      const res = await this.channelProvider.send(rpc);
      return Result.ok(res);
    } catch (e) {
      return Result.fail(e);
    }
  }

  async setup(
    params: OptionalPublicIdentifier<NodeParams.RequestSetup>,
  ): Promise<Result<NodeResponses.RequestSetup, NodeError>> {
    try {
      const rpc = constructRpcRequest<"chan_setup">(ChannelRpcMethods.chan_setup, params);
      const res = await this.channelProvider.send(rpc);
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
    try {
      const rpc = constructRpcRequest<"chan_deposit">(ChannelRpcMethods.chan_deposit, params);
      const res = await this.channelProvider.send(rpc);
      return Result.ok({ channelAddress: res.channelAddress });
    } catch (e) {
      return Result.fail(e);
    }
  }

  async requestCollateral(
    params: OptionalPublicIdentifier<NodeParams.RequestCollateral>,
  ): Promise<Result<NodeResponses.RequestCollateral, NodeError>> {
    try {
      const rpc = constructRpcRequest<"chan_requestCollateral">(ChannelRpcMethods.chan_requestCollateral, params);
      await this.channelProvider.send(rpc);
      return Result.ok({ channelAddress: params.channelAddress });
    } catch (e) {
      return Result.fail(e);
    }
  }

  async conditionalTransfer(
    params: OptionalPublicIdentifier<NodeParams.ConditionalTransfer>,
  ): Promise<Result<NodeResponses.ConditionalTransfer, NodeError>> {
    try {
      const rpc = constructRpcRequest<"chan_createTransfer">(ChannelRpcMethods.chan_createTransfer, params);
      const res = await this.channelProvider.send(rpc);
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
    try {
      const rpc = constructRpcRequest<"chan_resolveTransfer">(ChannelRpcMethods.chan_resolveTransfer, params);
      const res = await this.channelProvider.send(rpc);
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
    try {
      const rpc = constructRpcRequest<"chan_withdraw">(ChannelRpcMethods.chan_withdraw, params);
      const res = await this.channelProvider.send(rpc);
      return Result.ok({
        channelAddress: res.channel.channelAddress,
        transferId: (res.channel.latestUpdate.details as CreateUpdateDetails).transferId,
        transactionHash: res.transactionHash,
      });
    } catch (e) {
      return Result.fail(e);
    }
  }

  async send(payload: EngineParams.RpcRequest): Promise<any> {
    return this.channelProvider.send(payload);
  }

  //////////////////////
  /// DISPUTE METHODS
  async sendDisputeChannelTx(
    params: OptionalPublicIdentifier<NodeParams.SendDisputeChannelTx>,
  ): Promise<Result<NodeResponses.SendDisputeChannelTx, NodeError>> {
    throw new Error("TODO");
    // const channelRes = await this.getStateChannel(params);
    // if (!channelRes.isError) {
    //   return Result.fail(channelRes.getError()!);
    // }
    // const channel = channelRes.getValue();
    // if (!channel) {
    //   return Result.fail(new NodeError(NodeError.reasons.ChannelNotFound, params));
    // }
    // const disputeRes = await this.chainService.sendDisputeChannelTx(channel);
    // if (disputeRes.isError) {
    //   return Result.fail(disputeRes.getError()! as any);
    // }
    // return Result.ok({ txHash: disputeRes.getValue().hash });
  }

  async sendDefundChannelTx(
    params: OptionalPublicIdentifier<NodeParams.SendDefundChannelTx>,
  ): Promise<Result<NodeResponses.SendDefundChannelTx, NodeError>> {
    throw new Error("TODO");

    // const channelRes = await this.getStateChannel(params);
    // if (!channelRes.isError) {
    //   return Result.fail(channelRes.getError()!);
    // }
    // const channel = channelRes.getValue();
    // if (!channel) {
    //   return Result.fail(new NodeError(NodeError.reasons.ChannelNotFound, params));
    // }
    // const defundRes = await this.chainService.sendDefundChannelTx(channel);
    // if (defundRes.isError) {
    //   return Result.fail(defundRes.getError()! as any);
    // }
    // return Result.ok({ txHash: defundRes.getValue().hash });
  }

  async sendDisputeTransferTx(
    params: OptionalPublicIdentifier<NodeParams.SendDisputeTransferTx>,
  ): Promise<Result<NodeResponses.SendDisputeTransferTx, NodeError>> {
    throw new Error("TODO");

    // const transferRes = await this.getTransfer(params);
    // if (!transferRes.isError) {
    //   return Result.fail(transferRes.getError()!);
    // }
    // const transfer = transferRes.getValue();
    // if (!transfer) {
    //   return Result.fail(new NodeError(NodeError.reasons.TransferNotFound, params));
    // }
    // const activeTransferRes = await this.getActiveTransfers({
    //   channelAddress: transfer.chainAddress,
    //   publicIdentifier: this.publicIdentifier,
    // });
    // if (activeTransferRes.isError) {
    //   return Result.fail(activeTransferRes.getError()!);
    // }
    // const active = activeTransferRes.getValue();
    // if (!active.find(t => t.transferId === transfer.transferId)) {
    //   return Result.fail(new NodeError(NodeError.reasons.TransferNotActive, params));
    // }

    // // Generate merkle proof
    // const hashes = active.map(t => bufferify(hashCoreTransferState(t)));
    // const hash = bufferify(hashCoreTransferState(transfer));
    // const merkle = new MerkleTree(hashes, utils.keccak256);

    // const disputeRes = await this.chainService.sendDisputeTransferTx(transfer, merkle.getHexProof(hash));

    // if (disputeRes.isError) {
    //   return Result.fail(disputeRes.getError()! as any);
    // }
    // return Result.ok({ txHash: disputeRes.getValue().hash });
  }

  async sendDefundTransferTx(
    params: OptionalPublicIdentifier<NodeParams.SendDefundTransferTx>,
  ): Promise<Result<NodeResponses.SendDefundTransferTx, NodeError>> {
    throw new Error("TODO");

    // const transferRes = await this.getTransfer(params);
    // if (!transferRes.isError) {
    //   return Result.fail(transferRes.getError()!);
    // }
    // const transfer = transferRes.getValue();
    // if (!transfer) {
    //   return Result.fail(new NodeError(NodeError.reasons.TransferNotFound));
    // }
    // const defundRes = await this.chainService.sendDefundTransferTx(transfer);
    // if (defundRes.isError) {
    //   return Result.fail(defundRes.getError()! as any);
    // }
    // return Result.ok({ txHash: defundRes.getValue().hash });
  }

  waitFor<T extends EngineEvent>(
    event: T,
    timeout: number,
    filter?: (payload: EngineEventMap[T]) => boolean,
  ): Promise<EngineEventMap[T] | undefined> {
    throw new Error("TODO");
    // return this.engine.waitFor(event, timeout, filter);
  }

  async once<T extends EngineEvent>(
    event: T,
    callback: (payload: EngineEventMap[T]) => void | Promise<void>,
    filter?: (payload: EngineEventMap[T]) => boolean,
  ): Promise<void> {
    return this.channelProvider.once(event, callback, filter);
  }

  async on<T extends EngineEvent>(
    event: T,
    callback: (payload: EngineEventMap[T]) => void | Promise<void>,
    filter?: (payload: EngineEventMap[T]) => boolean,
  ): Promise<void> {
    return this.channelProvider.on(event, callback, filter);
  }

  async off<T extends EngineEvent>(event: T): Promise<void> {
    throw new Error("TODO");
    // return this.engine.off(event);
  }
}
