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
  TransferNames,
  EngineEvents,
  ConditionalTransferCreatedPayload,
  FullChannelState,
} from "@connext/vector-types";
import {
  constructRpcRequest,
  getPublicIdentifierFromPublicKey,
  getRandomBytes32,
  hydrateProviders,
  NatsMessagingService,
} from "@connext/vector-utils";
import { getAddress } from "@ethersproject/address";
import { sha256 as soliditySha256 } from "@ethersproject/solidity";
import { HashZero } from "@ethersproject/constants";
import pino, { BaseLogger } from "pino";

import { BrowserStore } from "./services/store";
import { BrowserLockService } from "./services/lock";
import { DirectProvider, IframeChannelProvider, IRpcChannelProvider } from "./channelProvider";
import {
  CrossChainTransferParams,
  CrossChainTransferStatus,
  getCrossChainTransfers,
  removeCrossChainTransfer,
  saveCrossChainTransfer,
  StoredCrossChainTransfer,
} from "./services/crossChainTransferStore";
import { BrowserNodeError, CrossChainTransferError } from "./errors";

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

  constructor(params: {
    logger?: pino.BaseLogger;
    routerPublicIdentifier?: string;
    supportedChains?: number[];
    iframeSrc?: string;
    chainProviders: ChainProviders;
  }) {
    this.logger = params.logger || pino();
    this.routerPublicIdentifier = params.routerPublicIdentifier;
    this.supportedChains = params.supportedChains || [];
    this.iframeSrc = params.iframeSrc;
    this.chainProviders = params.chainProviders;

    // Add listener for cross chain transfer cancellations
    this.on(EngineEvents.CONDITIONAL_TRANSFER_RESOLVED, (data) => {
      // remove from the storage if sender transfer was canceled
      const routingId = data.transfer.meta?.routingId;
      if (!routingId) {
        return;
      }
      const resolver = Object.values(data.transfer.transferResolver)[0];
      if (resolver !== HashZero) {
        return;
      }
      this.logger.warn({ transfer: data.transfer }, "Transfer cancelled, removing from store");
      // remove from store
      removeCrossChainTransfer(routingId);
    });
  }

  // method for signer-based connections
  static async connect(config: BrowserNodeSignerConfig): Promise<BrowserNode> {
    if (!config.logger) {
      const configuredIdentifier = getPublicIdentifierFromPublicKey(config.signer.publicKey);
      config.logger = pino({ name: configuredIdentifier });
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
    let iframeSrc = this.iframeSrc;
    if (!iframeSrc) {
      iframeSrc = "https://wallet.connext.network";
    }
    this.logger.info({ method: "connect", iframeSrc }, "Connecting with iframe provider");
    this.channelProvider = await IframeChannelProvider.connect({
      src: iframeSrc!,
      id: "connext-iframe",
    });
    const rpc = constructRpcRequest("connext_authenticate", { chainProviders: this.chainProviders });
    const auth = await this.channelProvider.send(rpc);
    this.logger.info({ method: "connect", response: auth }, "Received response from auth method");
    const [nodeConfig] = await this.getConfig();
    this.publicIdentifier = nodeConfig.publicIdentifier;
    this.signerAddress = nodeConfig.signerAddress;
    this.logger.info(
      { supportedChains: this.supportedChains, routerPublicIdentifier: this.routerPublicIdentifier },
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
        let channel = channelRes.getValue();
        if (!channel) {
          this.logger.info({ chainId }, "Setting up channel");
          const address = await this.setup({
            chainId,
            counterpartyIdentifier: this.routerPublicIdentifier!,
            timeout: "100000",
          });
          if (address.isError) {
            throw address.getError();
          }
          channel = (await this.getStateChannel(address.getValue())).getValue();
        }
        this.logger.info({ channel, chainId });
      }),
    );
  }

  // IFRAME SPECIFIC
  async crossChainTransfer(params: {
    amount: string;
    fromChainId: number;
    fromAssetId: string;
    toChainId: number;
    toAssetId: string;
    reconcileDeposit?: boolean;
    withdrawalAddress?: string;
    meta?: any;
    crossChainTransferId?: string;
    startStage?: number;
    preImage?: string;
    withdrawalAmount?: string;
  }): Promise<{ withdrawalTx?: string; withdrawalAmount?: string }> {
    this.logger.info({ params }, "Starting crossChainTransfer");
    const startStage = params.startStage ?? CrossChainTransferStatus.INITIAL;
    const { amount, fromChainId, toChainId, withdrawalAddress, reconcileDeposit } = params;
    const fromAssetId = getAddress(params.fromAssetId);
    const toAssetId = getAddress(params.toAssetId);

    const storeParams: CrossChainTransferParams = {
      amount: amount,
      fromAssetId: fromAssetId,
      fromChainId: fromChainId,
      reconcileDeposit: reconcileDeposit ?? false,
      toAssetId: toAssetId,
      toChainId: toChainId,
      withdrawalAddress,
      error: false,
    };
    const senderChannelRes = await this.getStateChannelByParticipants({
      counterparty: this.routerPublicIdentifier!,
      chainId: fromChainId,
    });
    if (senderChannelRes.isError) {
      throw senderChannelRes.getError();
    }
    const receiverChannelRes = await this.getStateChannelByParticipants({
      counterparty: this.routerPublicIdentifier!,
      chainId: toChainId,
    });
    if (receiverChannelRes.isError) {
      throw receiverChannelRes.getError();
    }
    const senderChannel = senderChannelRes.getValue();
    if (!senderChannel) {
      throw new CrossChainTransferError(
        CrossChainTransferError.reasons.MissingSenderChannel,
        this.publicIdentifier,
        params,
      );
    }
    const receiverChannel = receiverChannelRes.getValue();
    if (!receiverChannel) {
      throw new CrossChainTransferError(
        CrossChainTransferError.reasons.MissingReceiverChannel,
        this.publicIdentifier,
        params,
      );
    }

    const config = await this.getRouterConfig({ routerIdentifier: this.routerPublicIdentifier! });
    if (config.isError) {
      throw config.getError();
    }
    const { allowedSwaps, supportedChains } = config.getValue();
    if (!supportedChains.includes(fromChainId) || !supportedChains.includes(toChainId)) {
      throw new CrossChainTransferError(
        CrossChainTransferError.reasons.ChainNotSupported,
        this.publicIdentifier,
        params,
        { supportedChains, routerIdentifier: this.routerPublicIdentifier },
      );
    }
    const swap = allowedSwaps.find((s) => {
      const noninverted =
        s.fromAssetId === fromAssetId &&
        s.fromChainId === fromChainId &&
        s.toAssetId === toAssetId &&
        s.toChainId === toChainId;
      const inverted =
        s.toAssetId === fromAssetId &&
        s.toChainId === fromChainId &&
        s.fromAssetId === toAssetId &&
        s.fromChainId === toChainId;
      return noninverted || inverted;
    });
    if (!swap) {
      throw new CrossChainTransferError(
        CrossChainTransferError.reasons.SwapNotSupported,
        this.publicIdentifier,
        params,
        { allowedSwaps, routerIdentifier: this.routerPublicIdentifier },
      );
    }

    const crossChainTransferId = params.crossChainTransferId ?? getRandomBytes32();
    // add to stored transfers
    saveCrossChainTransfer(crossChainTransferId, startStage, storeParams);

    const { meta, ...res } = params;
    const updatedMeta = { ...res, crossChainTransferId, routingId: crossChainTransferId, ...(meta ?? {}) };

    if (startStage < CrossChainTransferStatus.DEPOSITED) {
      if (reconcileDeposit) {
        const depositRes = await this.reconcileDeposit({
          assetId: fromAssetId,
          channelAddress: senderChannel.channelAddress,
          meta: { ...updatedMeta },
        });
        if (depositRes.isError) {
          saveCrossChainTransfer(crossChainTransferId, CrossChainTransferStatus.INITIAL, {
            ...storeParams,
            error: true,
          });
          throw depositRes.getError();
        }
        const updated = await this.getStateChannel({ channelAddress: senderChannel.channelAddress });
        this.logger.info({ updated }, "Deposit reconciled");
      }
      saveCrossChainTransfer(crossChainTransferId, CrossChainTransferStatus.DEPOSITED, storeParams);
    }

    const preImage = params.preImage ?? getRandomBytes32();
    const lockHash = soliditySha256(["bytes32"], [preImage]);
    storeParams.preImage = preImage;

    let senderTransferId = "";
    if (startStage < CrossChainTransferStatus.TRANSFER_1) {
      const transferParams = {
        amount: amount,
        assetId: fromAssetId,
        channelAddress: senderChannel.channelAddress,
        details: {
          lockHash,
          expiry: "0",
        },
        type: TransferNames.HashlockTransfer,
        recipient: this.publicIdentifier,
        recipientAssetId: toAssetId,
        recipientChainId: toChainId,
        meta: { ...updatedMeta },
      };
      this.logger.info({ preImage, transferParams }, "Sending cross-chain transfer");
      const transferRes = await this.conditionalTransfer(transferParams);
      if (transferRes.isError) {
        saveCrossChainTransfer(crossChainTransferId, CrossChainTransferStatus.DEPOSITED, {
          ...storeParams,
          error: true,
        });
        throw transferRes.getError();
      }
      const senderTransfer = transferRes.getValue();
      senderTransferId = senderTransfer.transferId;
      this.logger.info({ senderTransfer }, "Sender transfer successfully completed, waiting for receiver transfer...");
      saveCrossChainTransfer(crossChainTransferId, CrossChainTransferStatus.TRANSFER_1, storeParams);
    }

    let receiverTransferData: ConditionalTransferCreatedPayload | undefined;
    let withdrawalAmount = params.withdrawalAmount;
    if (startStage < CrossChainTransferStatus.TRANSFER_2) {
      // first try to pull the transfer from store in case this was called through the resumePendingCrossChainTransfer function
      const receiverTransferDataPromise = new Promise<ConditionalTransferCreatedPayload>((res) => {
        this.on(EngineEvents.CONDITIONAL_TRANSFER_CREATED, (data) => {
          if (
            data.transfer.meta.routingId === crossChainTransferId &&
            data.channelAddress === receiverChannel.channelAddress
          ) {
            res(data);
          }
        });
      });
      const transferRes = await this.getTransferByRoutingId({
        channelAddress: receiverChannel.channelAddress,
        routingId: crossChainTransferId,
      });
      if (transferRes.isError) {
        throw transferRes.getError();
      }
      const existingReceiverTransfer = transferRes.getValue();
      let receiverTransferId = existingReceiverTransfer?.transferId;
      withdrawalAmount = existingReceiverTransfer?.balance.amount[0];
      this.logger.info({ existingReceiverTransfer }, "Existing receiver transfer");

      if (!existingReceiverTransfer) {
        receiverTransferData = await receiverTransferDataPromise;
        if (!receiverTransferData) {
          this.logger.error(
            { routingId: crossChainTransferId, channelAddress: receiverChannel.channelAddress },
            "Failed to get receiver event",
          );
          saveCrossChainTransfer(crossChainTransferId, CrossChainTransferStatus.TRANSFER_1, {
            ...storeParams,
            error: true,
          });
          throw new CrossChainTransferError(
            CrossChainTransferError.reasons.ReceiverEventMissed,
            this.publicIdentifier,
            params,
            { senderTransfer: senderTransferId, preImage },
          );
        }
        receiverTransferId = receiverTransferData.transfer.transferId;
        withdrawalAmount = receiverTransferData.transfer.balance.amount[0];
      }
      storeParams.withdrawalAmount = withdrawalAmount;

      this.logger.info({ receiverTransferData }, "Received receiver transfer, resolving...");
      const resolveParams = {
        channelAddress: receiverChannel.channelAddress,
        transferId: receiverTransferId!,
        transferResolver: {
          preImage,
        },
        meta: { ...updatedMeta },
      };
      const resolveRes = await this.resolveTransfer(resolveParams);
      if (resolveRes.isError) {
        saveCrossChainTransfer(crossChainTransferId, CrossChainTransferStatus.TRANSFER_1, {
          ...storeParams,
          error: true,
        });
        throw resolveRes.getError();
      }
      const resolvedTransfer = resolveRes.getValue();
      this.logger.info({ resolvedTransfer }, "Resolved receiver transfer");
      saveCrossChainTransfer(crossChainTransferId, CrossChainTransferStatus.TRANSFER_2, {
        ...storeParams,
        withdrawalAmount,
      });
    }

    let withdrawalTx: string | undefined;
    const withdrawalMeta = { ...res, crossChainTransferId, ...(meta ?? {}) };
    if (withdrawalAddress) {
      withdrawalAmount = params.withdrawalAmount ?? receiverTransferData?.transfer.balance.amount[0];
      if (!withdrawalAmount) {
        throw new CrossChainTransferError(
          CrossChainTransferError.reasons.MissingWithdrawalAmount,
          this.publicIdentifier,
          params,
          { senderTransfer: senderTransferId, receiverTransfer: receiverTransferData?.transfer.transferId },
        );
      }
      this.logger.info({ withdrawalAddress: withdrawalAddress, withdrawalAmount }, "Withdrawing to configured address");
      const withdrawRes = await this.withdraw({
        amount: withdrawalAmount, // bob is receiver
        assetId: toAssetId,
        channelAddress: receiverChannel.channelAddress,
        recipient: withdrawalAddress,
        meta: { ...withdrawalMeta },
      });
      if (withdrawRes.isError) {
        saveCrossChainTransfer(crossChainTransferId, CrossChainTransferStatus.TRANSFER_2, {
          ...storeParams,
          error: true,
        });
        throw withdrawRes.getError();
      }
      const withdrawal = withdrawRes.getValue();
      this.logger.info({ withdrawal }, "Withdrawal completed");
      withdrawalTx = withdrawal.transactionHash;
    }
    // remove from store
    removeCrossChainTransfer(crossChainTransferId);
    return { withdrawalTx, withdrawalAmount };
  }

  // separate from init(), can eventually be called as part of that
  async resumePendingCrossChainTransfers(): Promise<void> {
    const transfers = await getCrossChainTransfers();
    for (const transfer of transfers) {
      this.logger.info({ transfer }, "Starting pending crossChainTransfer");
      if (transfer.error) {
        this.logger.error({ transfer }, "Found errored transfer, TODO: handle these properly");
        continue;
      }
      try {
        await this.resumePendingCrossChainTransfer(transfer);
      } catch (e) {
        this.logger.error({ e: e.message, ...transfer }, "Failed to resume transfer");
      }
    }
  }

  private async resumePendingCrossChainTransfer(transferData: StoredCrossChainTransfer) {
    const {
      amount,
      withdrawalAddress,
      toChainId,
      toAssetId,
      fromChainId,
      fromAssetId,
      status,
      reconcileDeposit,
      crossChainTransferId,
      preImage,
      withdrawalAmount,
    } = transferData;

    await this.crossChainTransfer({
      amount,
      fromAssetId,
      fromChainId,
      toAssetId,
      toChainId,
      crossChainTransferId,
      reconcileDeposit,
      withdrawalAddress,
      startStage: status,
      preImage,
      withdrawalAmount,
    });
  }
  //////////////////

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
