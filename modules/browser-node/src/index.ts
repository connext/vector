import { deployments, VectorChainService } from "@connext/vector-contracts";
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
  OptionalPublicIdentifier,
  Result,
  NodeParams,
  NodeResponses,
  EngineParams,
  FullChannelState,
  DEFAULT_CHANNEL_TIMEOUT,
  GetTransfersFilterOpts,
} from "@connext/vector-types";
import { constructRpcRequest, hydrateProviders, NatsMessagingService } from "@connext/vector-utils";
import pino, { BaseLogger } from "pino";

import { BrowserStore } from "./services/store";
import { BrowserLockService } from "./services/lock";
import { DirectProvider, IframeChannelProvider, IRpcChannelProvider } from "./channelProvider";
import { BrowserNodeError } from "./errors";

export type BrowserNodeSignerConfig = {
  natsUrl?: string;
  authUrl?: string;
  messagingUrl?: string;
  logger?: BaseLogger;
  signer: IChannelSigner;
  chainProviders: ChainProviders;
  chainAddresses: ChainAddresses;
};

export class BrowserNode implements INodeService {
  public channelProvider: IRpcChannelProvider | undefined;
  public publicIdentifier = "";
  public signerAddress = "";
  private readonly logger: pino.BaseLogger;

  // SDK specific config
  private supportedChains: number[] = [];
  private routerPublicIdentifier?: string;
  private iframeSrc?: string;
  private chainProviders: ChainProviders = {};
  private chainAddresses?: ChainAddresses;
  private messagingUrl?: string;

  constructor(params: {
    logger?: pino.BaseLogger;
    routerPublicIdentifier?: string;
    supportedChains?: number[];
    iframeSrc?: string;
    chainProviders: ChainProviders;
    messagingUrl?: string;
    chainAddresses?: ChainAddresses;
  }) {
    this.logger = params.logger || pino();
    this.routerPublicIdentifier = params.routerPublicIdentifier;
    this.supportedChains = params.supportedChains || [];
    this.iframeSrc = params.iframeSrc;
    this.chainProviders = params.chainProviders;
    this.chainAddresses = params.chainAddresses;
    this.messagingUrl = params.messagingUrl;
  }

  // method for signer-based connections
  static async connect(config: BrowserNodeSignerConfig): Promise<BrowserNode> {
    if (!config.logger) {
      config.logger = pino({ name: config.signer.publicIdentifier });
    }
    const node = new BrowserNode({ logger: config.logger, chainProviders: config.chainProviders });
    // TODO: validate schema
    config.logger.info(
      { method: "connect", publicIdentifier: config.signer.publicIdentifier, signerAddress: config.signer.address },
      "Connecting with provided signer",
    );
    const chainJsonProviders = hydrateProviders(config.chainProviders!);
    const messaging = new NatsMessagingService({
      logger: config.logger.child({ module: "MessagingService" }),
      messagingUrl: config.messagingUrl,
      natsUrl: config.natsUrl,
      authUrl: config.authUrl,
      signer: config.signer,
    });
    await messaging.connect();
    const store = await BrowserStore.create(
      config.signer.publicIdentifier,
      config.logger.child({ module: "BrowserStore" }),
    );
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

    // Pull live network addresses out of public deployments if not provided explicitly
    for (const chainId of Object.keys(config.chainProviders)) {
      if (!config.chainAddresses) {
        config.chainAddresses = {} as any;
      }
      if (!config.chainAddresses[chainId]) {
        config.chainAddresses[chainId] = {} as any;
      }
      if (
        !config.chainAddresses[chainId].channelFactoryAddress &&
        deployments[chainId] &&
        deployments[chainId].ChannelFactory
      ) {
        config.chainAddresses[chainId].channelFactoryAddress = deployments[chainId].ChannelFactory.address;
      }
      if (
        !config.chainAddresses[chainId].transferRegistryAddress &&
        deployments[chainId] &&
        deployments[chainId].TransferRegistry
      ) {
        config.chainAddresses[chainId].transferRegistryAddress = deployments[chainId].TransferRegistry.address;
      }
    }

    const engine = await VectorEngine.connect(
      messaging,
      lock,
      store,
      config.signer,
      chainService,
      config.chainAddresses!,
      config.logger.child({ module: "VectorEngine" }),
      false,
    );
    node.channelProvider = new DirectProvider(engine);
    node.publicIdentifier = config.signer.publicIdentifier;
    node.signerAddress = config.signer.address;
    return node;
  }

  // method for non-signer based apps to connect to iframe
  async init(): Promise<void> {
    // TODO: validate config
    const method = "init";
    this.logger.debug({ method }, "Method started");
    const iframeSrc = this.iframeSrc ?? "https://wallet.connext.network";
    this.logger.info({ method, iframeSrc }, "Connecting with iframe provider");
    this.channelProvider = await IframeChannelProvider.connect({
      src: iframeSrc,
      id: "connext-iframe",
    });
    const rpc = constructRpcRequest("connext_authenticate", {
      chainProviders: this.chainProviders,
      chainAddresses: this.chainAddresses,
      messagingUrl: this.messagingUrl,
    });
    const auth = await this.channelProvider.send(rpc);
    this.logger.info({ method, response: auth }, "Received response from auth method");
    const [nodeConfig] = await this.getConfig();
    this.publicIdentifier = nodeConfig.publicIdentifier;
    this.signerAddress = nodeConfig.signerAddress;
    this.logger.info(
      { supportedChains: this.supportedChains, routerPublicIdentifier: this.routerPublicIdentifier, method },
      "Checking for existing channels",
    );
    await Promise.all(
      this.supportedChains.map(async (chainId) => {
        const channelRes = await this.getStateChannelByParticipants({
          chainId,
          counterparty: this.routerPublicIdentifier!,
        });
        if (channelRes.isError) {
          throw channelRes.getError();
        }
        const channel = channelRes.getValue();
        if (channel) {
          this.logger.info({ channelAddress: channel.channelAddress, chainId, method }, "Found setup channel");
          return;
        }
        this.logger.info({ chainId, method }, "Setting up channel");
        const address = await this.setup({
          chainId,
          counterpartyIdentifier: this.routerPublicIdentifier!,
          timeout: DEFAULT_CHANNEL_TIMEOUT.toString(),
        });
        if (address.isError) {
          throw address.getError();
        }
        this.logger.info({ channelAddress: address.getValue(), chainId, method }, "Created channel");
      }),
    );
    this.logger.debug({ method }, "Method complete");
  }

  createNode(params: NodeParams.CreateNode): Promise<Result<NodeResponses.CreateNode, BrowserNodeError>> {
    return Promise.resolve(
      Result.fail(new BrowserNodeError(BrowserNodeError.reasons.MultinodeProhibitted, this.publicIdentifier, params)),
    );
  }

  async getConfig(): Promise<NodeResponses.GetConfig> {
    const rpc = constructRpcRequest("chan_getConfig", {});
    return this.send(rpc);
  }

  async getRouterConfig(
    params: OptionalPublicIdentifier<NodeParams.GetRouterConfig>,
  ): Promise<Result<NodeResponses.GetRouterConfig, BrowserNodeError>> {
    const rpc = constructRpcRequest("chan_getRouterConfig", params);
    try {
      const res = await this.send(rpc);
      return Result.ok(res);
    } catch (e) {
      return Result.fail(e);
    }
  }

  async getStatus(): Promise<Result<NodeResponses.GetStatus, BrowserNodeError>> {
    const rpc = constructRpcRequest("chan_getStatus", {});
    try {
      const res = await this.send(rpc);
      return Result.ok(res);
    } catch (e) {
      return Result.fail(e);
    }
  }

  async getStateChannelByParticipants(
    params: OptionalPublicIdentifier<NodeParams.GetChannelStateByParticipants>,
  ): Promise<Result<NodeResponses.GetChannelStateByParticipants, BrowserNodeError>> {
    try {
      const rpc = constructRpcRequest<"chan_getChannelStateByParticipants">(
        ChannelRpcMethods.chan_getChannelStateByParticipants,
        {
          alice: params.counterparty,
          bob: this.publicIdentifier,
          chainId: params.chainId,
        },
      );
      const res = await this.send(rpc);
      return Result.ok(res);
    } catch (e) {
      return Result.fail(e);
    }
  }

  async getStateChannel(
    params: OptionalPublicIdentifier<NodeParams.GetChannelState>,
  ): Promise<Result<NodeResponses.GetChannelState, BrowserNodeError>> {
    try {
      const rpc = constructRpcRequest<"chan_getChannelState">(ChannelRpcMethods.chan_getChannelState, params);
      const res = await this.channelProvider!.send(rpc);
      return Result.ok(res);
    } catch (e) {
      return Result.fail(e);
    }
  }

  async getStateChannels(): Promise<Result<NodeResponses.GetChannelStates, BrowserNodeError>> {
    try {
      const rpc = constructRpcRequest<"chan_getChannelStates">(ChannelRpcMethods.chan_getChannelStates, {});
      const res = await this.channelProvider!.send(rpc);
      return Result.ok(res.map((chan: FullChannelState) => chan.channelAddress));
    } catch (e) {
      return Result.fail(e);
    }
  }

  async getTransferByRoutingId(
    params: OptionalPublicIdentifier<NodeParams.GetTransferStateByRoutingId>,
  ): Promise<Result<NodeResponses.GetTransferStateByRoutingId, BrowserNodeError>> {
    try {
      const rpc = constructRpcRequest<"chan_getTransferStateByRoutingId">(
        ChannelRpcMethods.chan_getTransferStateByRoutingId,
        params,
      );
      const res = await this.channelProvider!.send(rpc);
      return Result.ok(res);
    } catch (e) {
      return Result.fail(e);
    }
  }

  async getTransfersByRoutingId(
    params: OptionalPublicIdentifier<NodeParams.GetTransferStatesByRoutingId>,
  ): Promise<Result<NodeResponses.GetTransferStatesByRoutingId, BrowserNodeError>> {
    try {
      const rpc = constructRpcRequest<"chan_getTransferStatesByRoutingId">(
        ChannelRpcMethods.chan_getTransferStatesByRoutingId,
        params,
      );
      const res = await this.channelProvider!.send(rpc);
      return Result.ok(res as NodeResponses.GetTransferStatesByRoutingId);
    } catch (e) {
      return Result.fail(e);
    }
  }

  async getTransfer(
    params: OptionalPublicIdentifier<NodeParams.GetTransferState>,
  ): Promise<Result<NodeResponses.GetTransferState, BrowserNodeError>> {
    try {
      const rpc = constructRpcRequest<"chan_getTransferState">(ChannelRpcMethods.chan_getTransferState, params);
      const res = await this.channelProvider!.send(rpc);
      return Result.ok(res);
    } catch (e) {
      return Result.fail(e);
    }
  }

  async getActiveTransfers(
    params: OptionalPublicIdentifier<NodeParams.GetActiveTransfersByChannelAddress>,
  ): Promise<Result<NodeResponses.GetActiveTransfersByChannelAddress, BrowserNodeError>> {
    try {
      const rpc = constructRpcRequest<"chan_getActiveTransfers">(ChannelRpcMethods.chan_getActiveTransfers, params);
      const res = await this.channelProvider!.send(rpc);
      return Result.ok(res);
    } catch (e) {
      return Result.fail(e);
    }
  }

  async getTransfers(
    params: OptionalPublicIdentifier<
      NodeParams.GetTransfers &
        Omit<GetTransfersFilterOpts, "startDate" | "endDate"> & { startDate: Date; endDate: Date } // in the client, use Date type
    >,
  ): Promise<Result<NodeResponses.GetActiveTransfersByChannelAddress, BrowserNodeError>> {
    try {
      const rpc = constructRpcRequest<"chan_getTransfers">(ChannelRpcMethods.chan_getTransfers, {
        filterOpts: {
          active: params.active,
          channelAddress: params.channelAddress,
          endDate: params.endDate,
          routingId: params.routingId,
          startDate: params.startDate,
        },
      });
      const res = await this.channelProvider!.send(rpc);
      return Result.ok(res);
    } catch (e) {
      return Result.fail(e);
    }
  }

  async getRegisteredTransfers(
    params: OptionalPublicIdentifier<NodeParams.GetRegisteredTransfers>,
  ): Promise<Result<NodeResponses.GetRegisteredTransfers, BrowserNodeError>> {
    try {
      const rpc = constructRpcRequest<"chan_getRegisteredTransfers">(
        ChannelRpcMethods.chan_getRegisteredTransfers,
        params,
      );
      const res = await this.channelProvider!.send(rpc);
      return Result.ok(res);
    } catch (e) {
      return Result.fail(e);
    }
  }

  async setup(
    params: OptionalPublicIdentifier<NodeParams.RequestSetup>,
  ): Promise<Result<NodeResponses.RequestSetup, BrowserNodeError>> {
    try {
      const rpc = constructRpcRequest<"chan_requestSetup">(ChannelRpcMethods.chan_requestSetup, params);
      const res = await this.channelProvider!.send(rpc);
      return Result.ok(res);
    } catch (e) {
      return Result.fail(e);
    }
  }

  // OK to leave unimplemented since browser node will never be Alice
  async internalSetup(): Promise<Result<NodeResponses.Setup, BrowserNodeError>> {
    return Result.fail(new BrowserNodeError(BrowserNodeError.reasons.MethodNotImplemented, this.publicIdentifier));
  }

  // OK to leave unimplemented since all txes can be sent from outside the browser node
  async sendDepositTx(): Promise<Result<NodeResponses.SendDepositTx, BrowserNodeError>> {
    return Result.fail(new BrowserNodeError(BrowserNodeError.reasons.MethodNotImplemented, this.publicIdentifier));
  }

  async reconcileDeposit(
    params: OptionalPublicIdentifier<NodeParams.Deposit>,
  ): Promise<Result<NodeResponses.Deposit, BrowserNodeError>> {
    try {
      const rpc = constructRpcRequest<"chan_deposit">(ChannelRpcMethods.chan_deposit, params);
      const res = await this.channelProvider!.send(rpc);
      return Result.ok({ channelAddress: res.channelAddress });
    } catch (e) {
      return Result.fail(e);
    }
  }

  async requestCollateral(
    params: OptionalPublicIdentifier<NodeParams.RequestCollateral>,
  ): Promise<Result<NodeResponses.RequestCollateral, BrowserNodeError>> {
    try {
      const rpc = constructRpcRequest<"chan_requestCollateral">(ChannelRpcMethods.chan_requestCollateral, params);
      await this.channelProvider!.send(rpc);
      return Result.ok({ channelAddress: params.channelAddress });
    } catch (e) {
      return Result.fail(e);
    }
  }

  async conditionalTransfer(
    params: OptionalPublicIdentifier<NodeParams.ConditionalTransfer>,
  ): Promise<Result<NodeResponses.ConditionalTransfer, BrowserNodeError>> {
    try {
      const rpc = constructRpcRequest<"chan_createTransfer">(ChannelRpcMethods.chan_createTransfer, params);
      const res = await this.channelProvider!.send(rpc);
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
  ): Promise<Result<NodeResponses.ResolveTransfer, BrowserNodeError>> {
    try {
      const rpc = constructRpcRequest<"chan_resolveTransfer">(ChannelRpcMethods.chan_resolveTransfer, params);
      const res = await this.channelProvider!.send(rpc);
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
  ): Promise<Result<NodeResponses.Withdraw, BrowserNodeError>> {
    try {
      const rpc = constructRpcRequest<"chan_withdraw">(ChannelRpcMethods.chan_withdraw, params);
      const res = await this.channelProvider!.send(rpc);
      return Result.ok({
        channelAddress: res.channel.channelAddress,
        transferId: (res.channel.latestUpdate.details as CreateUpdateDetails).transferId,
        transactionHash: res.transactionHash,
      });
    } catch (e) {
      return Result.fail(e);
    }
  }

  async restoreState(
    params: OptionalPublicIdentifier<NodeParams.RestoreState>,
  ): Promise<Result<NodeResponses.RestoreState, BrowserNodeError>> {
    try {
      const rpc = constructRpcRequest<"chan_restoreState">(ChannelRpcMethods.chan_restoreState, params);
      const res = await this.channelProvider!.send(rpc);
      return Result.ok({ channelAddress: res.channelAddress });
    } catch (e) {
      return Result.fail(e);
    }
  }

  async signUtilityMessage(
    params: OptionalPublicIdentifier<NodeParams.SignUtilityMessage>,
  ): Promise<Result<NodeResponses.SignUtilityMessage, BrowserNodeError>> {
    try {
      const rpc = constructRpcRequest<"chan_signUtilityMessage">(ChannelRpcMethods.chan_signUtilityMessage, params);
      const res = await this.channelProvider!.send(rpc);
      return Result.ok({
        signedMessage: res,
      });
    } catch (e) {
      return Result.fail(e);
    }
  }

  async sendIsAliveMessage(
    params: OptionalPublicIdentifier<NodeParams.SendIsAlive>,
  ): Promise<Result<NodeResponses.SendIsAlive, BrowserNodeError>> {
    const rpc = constructRpcRequest(ChannelRpcMethods.chan_sendIsAlive, params);
    try {
      const res = await this.channelProvider!.send(rpc);
      return Result.ok({ channelAddress: res.channelAddress });
    } catch (e) {
      return Result.fail(e);
    }
  }

  async send(payload: EngineParams.RpcRequest): Promise<any> {
    return this.channelProvider!.send(payload);
  }

  //////////////////////
  /// DISPUTE METHODS
  async sendDisputeChannelTx(
    params: OptionalPublicIdentifier<NodeParams.SendDisputeChannelTx>,
  ): Promise<Result<NodeResponses.SendDisputeChannelTx, BrowserNodeError>> {
    const rpc = constructRpcRequest(ChannelRpcMethods.chan_dispute, params);
    try {
      const res = await this.channelProvider!.send(rpc);
      return Result.ok({ txHash: res.transactionHash });
    } catch (e) {
      return Result.fail(e);
    }
  }

  async sendDefundChannelTx(
    params: OptionalPublicIdentifier<NodeParams.SendDefundChannelTx>,
  ): Promise<Result<NodeResponses.SendDefundChannelTx, BrowserNodeError>> {
    const rpc = constructRpcRequest(ChannelRpcMethods.chan_defund, params);
    try {
      const res = await this.channelProvider!.send(rpc);
      return Result.ok({ txHash: res.transactionHash });
    } catch (e) {
      return Result.fail(e);
    }
  }

  async sendDisputeTransferTx(
    params: OptionalPublicIdentifier<NodeParams.SendDisputeTransferTx>,
  ): Promise<Result<NodeResponses.SendDisputeTransferTx, BrowserNodeError>> {
    const rpc = constructRpcRequest(ChannelRpcMethods.chan_disputeTransfer, params);
    try {
      const res = await this.channelProvider!.send(rpc);
      return Result.ok({ txHash: res.transactionHash });
    } catch (e) {
      return Result.fail(e);
    }
  }

  async sendDefundTransferTx(
    params: OptionalPublicIdentifier<NodeParams.SendDefundTransferTx>,
  ): Promise<Result<NodeResponses.SendDefundTransferTx, BrowserNodeError>> {
    const rpc = constructRpcRequest(ChannelRpcMethods.chan_defundTransfer, params);
    try {
      const res = await this.channelProvider!.send(rpc);
      return Result.ok({ txHash: res.transactionHash });
    } catch (e) {
      return Result.fail(e);
    }
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
    return this.channelProvider!.once(event, callback, filter);
  }

  async on<T extends EngineEvent>(
    event: T,
    callback: (payload: EngineEventMap[T]) => void | Promise<void>,
    filter?: (payload: EngineEventMap[T]) => boolean,
  ): Promise<void> {
    return this.channelProvider!.on(event, callback, filter);
  }

  async off<T extends EngineEvent>(event: T): Promise<void> {
    throw new Error("TODO");
    // return this.engine.off(event);
  }
}
