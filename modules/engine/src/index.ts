import { Vector } from "@connext/vector-protocol";
import {
  ChainAddresses,
  IChannelSigner,
  ILockService,
  IMessagingService,
  IVectorProtocol,
  Result,
  EngineParams,
  OutboundChannelUpdateError,
  ChannelRpcMethodsResponsesMap,
  IVectorEngine,
  EngineEventMap,
  IEngineStore,
  EngineEvent,
  EngineEvents,
  ChannelRpcMethod,
  IVectorChainService,
  WITHDRAWAL_RECONCILED_EVENT,
  ChannelRpcMethods,
  IExternalValidation,
  AUTODEPLOY_CHAIN_IDS,
} from "@connext/vector-types";
import pino from "pino";
import Ajv from "ajv";
import { Evt } from "evt";

import { InvalidTransferType } from "./errors";
import {
  convertConditionalTransferParams,
  convertResolveConditionParams,
  convertWithdrawParams,
} from "./paramConverter";
import { setupEngineListeners } from "./listeners";
import { getEngineEvtContainer } from "./utils";

export const ajv = new Ajv();

export type EngineEvtContainer = { [K in keyof EngineEventMap]: Evt<EngineEventMap[K]> };

export class VectorEngine implements IVectorEngine {
  // Setup event container to emit events from vector
  // FIXME: Is this JSON RPC compatible?
  // RS: it's not, we will have to change the .on methods to use a JSON RPC compatible subscription
  private readonly evts: EngineEvtContainer = getEngineEvtContainer();

  private constructor(
    private readonly signer: IChannelSigner,
    private readonly messaging: IMessagingService,
    private readonly store: IEngineStore,
    private readonly vector: IVectorProtocol,
    private readonly chainService: IVectorChainService,
    private readonly chainAddresses: ChainAddresses,
    private readonly logger: pino.BaseLogger,
  ) {}

  static async connect(
    messaging: IMessagingService,
    lock: ILockService,
    store: IEngineStore,
    signer: IChannelSigner,
    chainService: IVectorChainService,
    chainAddresses: ChainAddresses,
    logger: pino.BaseLogger,
    validationService?: IExternalValidation,
  ): Promise<VectorEngine> {
    const vector = await Vector.connect(
      messaging,
      lock,
      store,
      signer,
      chainService,
      logger.child({ module: "VectorProtocol" }),
      validationService,
    );
    const engine = new VectorEngine(
      signer,
      messaging,
      store,
      vector,
      chainService,
      chainAddresses,
      logger.child({ module: "VectorEngine" }),
    );
    await engine.setupListener();
    logger.info({ vector: vector.publicIdentifier }, "Vector Engine connected 🚀!");
    return engine;
  }

  get publicIdentifier(): string {
    return this.vector.publicIdentifier;
  }

  get signerAddress(): string {
    return this.vector.signerAddress;
  }

  // TODO: create injected validation that handles submitting transactions
  // IFF there was a fee involved. Should:
  // - check if fee > 0
  //    - yes && my withdrawal: make sure transaction hash is included in
  //      the meta (verify tx)

  private async setupListener(): Promise<void> {
    await setupEngineListeners(
      this.evts,
      this.chainService,
      this.vector,
      this.messaging,
      this.signer,
      this.store,
      this.chainAddresses,
      this.logger,
      this.setup.bind(this),
    );
  }

  private async getConfig(): Promise<Result<ChannelRpcMethodsResponsesMap[typeof ChannelRpcMethods.chan_getConfig]>> {
    return Result.ok([{ index: 0, publicIdentifier: this.publicIdentifier, signerAddress: this.signerAddress }]);
  }

  private async getChannelState(
    params: EngineParams.GetChannelState,
  ): Promise<
    Result<
      ChannelRpcMethodsResponsesMap[typeof ChannelRpcMethods.chan_getChannelState],
      Error | OutboundChannelUpdateError
    >
  > {
    const validate = ajv.compile(EngineParams.GetChannelStateSchema);
    const valid = validate(params);
    if (!valid) {
      return Result.fail(new Error(validate.errors?.map(err => err.message).join(",")));
    }
    const channel = await this.vector.getChannelState(params.channelAddress);
    return Result.ok(channel);
  }

  private async getTransferState(
    params: EngineParams.GetTransferState,
  ): Promise<Result<ChannelRpcMethodsResponsesMap[typeof ChannelRpcMethods.chan_getTransferState], Error>> {
    const validate = ajv.compile(EngineParams.GetTransferStateSchema);
    const valid = validate(params);
    if (!valid) {
      return Result.fail(new Error(validate.errors?.map(err => err.message).join(",")));
    }

    try {
      const transfer = await this.store.getTransferState(params.transferId);
      return Result.ok(transfer);
    } catch (e) {
      return Result.fail(e);
    }
  }

  private async getActiveTransfers(
    params: EngineParams.GetActiveTransfers,
  ): Promise<Result<ChannelRpcMethodsResponsesMap[typeof ChannelRpcMethods.chan_getActiveTransfers], Error>> {
    const validate = ajv.compile(EngineParams.GetActiveTransfersSchema);
    const valid = validate(params);
    if (!valid) {
      return Result.fail(new Error(validate.errors?.map(err => err.message).join(",")));
    }

    try {
      const transfers = await this.store.getActiveTransfers(params.channelAddress);
      return Result.ok(transfers);
    } catch (e) {
      return Result.fail(e);
    }
  }

  private async getTransferStateByRoutingId(
    params: EngineParams.GetTransferStateByRoutingId,
  ): Promise<Result<ChannelRpcMethodsResponsesMap[typeof ChannelRpcMethods.chan_getTransferStateByRoutingId], Error>> {
    const validate = ajv.compile(EngineParams.GetTransferStateByRoutingIdSchema);
    const valid = validate(params);
    if (!valid) {
      return Result.fail(new Error(validate.errors?.map(err => err.message).join(",")));
    }
    const transfer = await this.store.getTransferByRoutingId(params.channelAddress, params.routingId);
    return Result.ok(transfer);
  }

  private async getTransferStatesByRoutingId(
    params: EngineParams.GetTransferStatesByRoutingId,
  ): Promise<Result<ChannelRpcMethodsResponsesMap[typeof ChannelRpcMethods.chan_getTransferStatesByRoutingId], Error>> {
    const validate = ajv.compile(EngineParams.GetTransferStatesByRoutingIdSchema);
    const valid = validate(params);
    if (!valid) {
      return Result.fail(new Error(validate.errors?.map(err => err.message).join(",")));
    }
    const transfers = await this.store.getTransfersByRoutingId(params.routingId);
    return Result.ok(transfers);
  }

  private async getChannelStateByParticipants(
    params: EngineParams.GetChannelStateByParticipants,
  ): Promise<
    Result<
      ChannelRpcMethodsResponsesMap[typeof ChannelRpcMethods.chan_getChannelStateByParticipants],
      Error | OutboundChannelUpdateError
    >
  > {
    const validate = ajv.compile(EngineParams.GetChannelStateByParticipantsSchema);
    const valid = validate(params);
    if (!valid) {
      return Result.fail(new Error(validate.errors?.map(err => err.message).join(",")));
    }
    const channel = await this.vector.getChannelStateByParticipants(params.alice, params.bob, params.chainId);
    return Result.ok(channel);
  }

  private async getChannelStates(): Promise<
    Result<
      ChannelRpcMethodsResponsesMap[typeof ChannelRpcMethods.chan_getChannelStates],
      Error | OutboundChannelUpdateError
    >
  > {
    const channel = await this.vector.getChannelStates();
    return Result.ok(channel);
  }

  private async setup(
    params: EngineParams.Setup,
  ): Promise<
    Result<ChannelRpcMethodsResponsesMap[typeof ChannelRpcMethods.chan_setup], OutboundChannelUpdateError | Error>
  > {
    const validate = ajv.compile(EngineParams.SetupSchema);
    const valid = validate(params);
    if (!valid) {
      return Result.fail(new Error(validate.errors?.map(err => err.message).join(",")));
    }

    const chainProviders = this.chainService.getChainProviders();
    if (chainProviders.isError) {
      return Result.fail(new Error(chainProviders.getError()!.message));
    }

    const setupRes = await this.vector.setup({
      counterpartyIdentifier: params.counterpartyIdentifier,
      timeout: params.timeout,
      networkContext: {
        channelFactoryAddress: this.chainAddresses[params.chainId].channelFactoryAddress,
        transferRegistryAddress: this.chainAddresses[params.chainId].transferRegistryAddress,
        chainId: params.chainId,
        providerUrl: chainProviders.getValue()[params.chainId],
      },
    });

    if (setupRes.isError) {
      return setupRes;
    }

    const channel = setupRes.getValue();
    if (this.signerAddress === channel.bob) {
      return setupRes;
    }

    // If it is alice && chain id is in autodeployable chains, deploy contract
    if (!AUTODEPLOY_CHAIN_IDS.includes(channel.networkContext.chainId)) {
      return setupRes;
    }

    this.logger.info(
      { chainId: channel.networkContext.chainId, channel: channel.channelAddress },
      "Deploying channel multisig",
    );
    const deployRes = await this.chainService.sendDeployChannelTx(channel);
    if (deployRes.isError) {
      const err = deployRes.getError();
      this.logger.error(
        {
          ...(err?.context ?? {}),
          chainId: channel.networkContext.chainId,
          channel: channel.channelAddress,
          error: deployRes.getError()!.message,
        },
        "Failed to deploy channel multisig",
      );
      return setupRes;
    }
    const tx = deployRes.getValue();
    this.logger.info({ chainId: channel.networkContext.chainId, hash: tx.hash }, "Deploy tx broadcast");
    await tx.wait();
    this.logger.debug({ chainId: channel.networkContext.chainId, hash: tx.hash }, "Deploy tx mined");
    return setupRes;
  }

  private async requestSetup(
    params: EngineParams.Setup,
  ): Promise<Result<{ channelAddress: string }, OutboundChannelUpdateError | Error>> {
    const validate = ajv.compile(EngineParams.SetupSchema);
    const valid = validate(params);
    if (!valid) {
      return Result.fail(new Error(validate.errors?.map(err => err.message).join(",")));
    }

    const chainProviders = this.chainService.getChainProviders();
    if (chainProviders.isError) {
      return Result.fail(new Error(chainProviders.getError()!.message));
    }

    return this.messaging.sendSetupMessage(
      { chainId: params.chainId, timeout: params.timeout },
      params.counterpartyIdentifier,
      this.publicIdentifier,
    );
  }

  private async deposit(
    params: EngineParams.Deposit,
  ): Promise<
    Result<ChannelRpcMethodsResponsesMap[typeof ChannelRpcMethods.chan_deposit], OutboundChannelUpdateError | Error>
  > {
    const validate = ajv.compile(EngineParams.DepositSchema);
    const valid = validate(params);
    if (!valid) {
      return Result.fail(new Error(validate.errors?.map(err => err.message).join(",")));
    }

    return this.vector.deposit(params);
  }

  private async requestCollateral(
    params: EngineParams.RequestCollateral,
  ): Promise<Result<undefined, OutboundChannelUpdateError | Error>> {
    const validate = ajv.compile(EngineParams.RequestCollateralSchema);
    const valid = validate(params);
    if (!valid) {
      return Result.fail(new Error(validate.errors?.map(err => err.message).join(",")));
    }

    const channel = await this.store.getChannelState(params.channelAddress);
    if (!channel) {
      return Result.fail(
        new OutboundChannelUpdateError(OutboundChannelUpdateError.reasons.ChannelNotFound, params as any),
      );
    }

    const request = await this.messaging.sendRequestCollateralMessage(
      params,
      this.publicIdentifier === channel.aliceIdentifier ? channel.bobIdentifier : channel.aliceIdentifier,
      this.publicIdentifier,
    );
    return request;
  }

  private async createTransfer(
    params: EngineParams.ConditionalTransfer,
  ): Promise<
    Result<
      ChannelRpcMethodsResponsesMap[typeof ChannelRpcMethods.chan_createTransfer],
      InvalidTransferType | OutboundChannelUpdateError
    >
  > {
    const validate = ajv.compile(EngineParams.ConditionalTransferSchema);
    const valid = validate(params);
    if (!valid) {
      return Result.fail(new Error(validate.errors?.map(err => err.message).join(",")));
    }

    const channel = await this.store.getChannelState(params.channelAddress);
    if (!channel) {
      return Result.fail(
        new OutboundChannelUpdateError(OutboundChannelUpdateError.reasons.ChannelNotFound, params as any),
      );
    }

    // First, get translated `create` params using the passed in conditional transfer ones
    const createResult = await convertConditionalTransferParams(
      params,
      this.signer,
      channel!,
      this.chainAddresses,
      this.chainService,
    );
    if (createResult.isError) {
      return Result.fail(createResult.getError()!);
    }
    const createParams = createResult.getValue();
    const protocolRes = await this.vector.create(createParams);
    if (protocolRes.isError) {
      return Result.fail(protocolRes.getError()!);
    }
    const res = protocolRes.getValue();
    return Result.ok(res);
  }

  private async resolveTransfer(
    params: EngineParams.ResolveTransfer,
  ): Promise<Result<ChannelRpcMethodsResponsesMap[typeof ChannelRpcMethods.chan_resolveTransfer], Error>> {
    const validate = ajv.compile(EngineParams.ResolveTransferSchema);
    const valid = validate(params);
    if (!valid) {
      return Result.fail(new Error(validate.errors?.map(err => err.message).join(",")));
    }

    // TODO: consider a store method to find active transfer by routingId
    const transfer = await this.store.getTransferState(params.transferId);
    if (!transfer) {
      return Result.fail(
        new OutboundChannelUpdateError(OutboundChannelUpdateError.reasons.TransferNotFound, params as any),
      );
    }
    // TODO validate that transfer hasn't already been resolved?

    // First, get translated `create` params using the passed in conditional transfer ones
    const resolveResult = convertResolveConditionParams(params, transfer);
    if (resolveResult.isError) {
      return Result.fail(resolveResult.getError()!);
    }
    const resolveParams = resolveResult.getValue();
    const protocolRes = await this.vector.resolve(resolveParams);
    if (protocolRes.isError) {
      return Result.fail(protocolRes.getError()!);
    }
    const res = protocolRes.getValue();
    return Result.ok(res);
  }

  private async withdraw(
    params: EngineParams.Withdraw,
  ): Promise<Result<ChannelRpcMethodsResponsesMap[typeof ChannelRpcMethods.chan_withdraw], Error>> {
    const validate = ajv.compile(EngineParams.WithdrawSchema);
    const valid = validate(params);
    if (!valid) {
      return Result.fail(new Error(validate.errors?.map(err => err.message).join(",")));
    }

    const channel = await this.store.getChannelState(params.channelAddress);
    if (!channel) {
      return Result.fail(
        new OutboundChannelUpdateError(OutboundChannelUpdateError.reasons.ChannelNotFound, params as any),
      );
    }

    // First, get translated `create` params from withdraw
    const createResult = await convertWithdrawParams(
      params,
      this.signer,
      channel,
      this.chainAddresses,
      this.chainService,
    );
    if (createResult.isError) {
      return Result.fail(createResult.getError()!);
    }
    const createParams = createResult.getValue();
    const protocolRes = await this.vector.create(createParams);
    if (protocolRes.isError) {
      return Result.fail(protocolRes.getError()!);
    }
    const res = protocolRes.getValue();
    const transferId = res.latestUpdate.details.transferId;
    this.logger.info({ channelAddress: params.channelAddress, transferId }, "Withdraw transfer created");

    let transactionHash: string | undefined = undefined;
    const timeout = 90_000;
    try {
      const event = await this.evts[WITHDRAWAL_RECONCILED_EVENT].attachOnce(
        timeout,
        data => data.channelAddress === params.channelAddress && data.transferId === transferId,
      );
      transactionHash = event.transactionHash;
    } catch (e) {
      this.logger.warn({ channelAddress: params.channelAddress, transferId, timeout }, "Withdraw tx not submitted");
    }

    return Result.ok({ channel: res, transactionHash });
  }

  private async disputeChannel(
    params: EngineParams.DisputeChannel,
  ): Promise<Result<ChannelRpcMethodsResponsesMap[typeof ChannelRpcMethods.chan_dispute], Error>> {
    const channel = await this.getChannelState({ channelAddress: params.channelAddress });
    if (channel.isError) {
      return Result.fail(channel.getError()!);
    }
    const state = channel.getValue();
    if (!state) {
      return Result.fail(
        new OutboundChannelUpdateError(OutboundChannelUpdateError.reasons.ChannelNotFound, params as any),
      );
    }
    const disputeRes = await this.chainService.sendDisputeChannelTx(state);
    if (disputeRes.isError) {
      return Result.fail(disputeRes.getError()!);
    }

    return Result.ok({ transactionHash: disputeRes.getValue().hash });
  }

  private async defundChannel(
    params: EngineParams.DefundChannel,
  ): Promise<Result<ChannelRpcMethodsResponsesMap[typeof ChannelRpcMethods.chan_defund], Error>> {
    const channel = await this.getChannelState({ channelAddress: params.channelAddress });
    if (channel.isError) {
      return Result.fail(channel.getError()!);
    }
    const state = channel.getValue();
    if (!state) {
      return Result.fail(
        new OutboundChannelUpdateError(OutboundChannelUpdateError.reasons.ChannelNotFound, params as any),
      );
    }
    if (!state.inDispute) {
      return Result.fail(new Error("Channel not in dispute"));
    }
    const disputeRes = await this.chainService.sendDefundChannelTx(state);
    if (disputeRes.isError) {
      return Result.fail(disputeRes.getError()!);
    }

    return Result.ok({ transactionHash: disputeRes.getValue().hash });
  }

  private async disputeTransfer(
    params: EngineParams.DisputeTransfer,
  ): Promise<Result<ChannelRpcMethodsResponsesMap[typeof ChannelRpcMethods.chan_disputeTransfer], Error>> {
    const transferRes = await this.getTransferState(params);
    if (transferRes.isError) {
      return Result.fail(transferRes.getError()!);
    }
    const transfer = transferRes.getValue();
    if (!transfer) {
      return Result.fail(
        new OutboundChannelUpdateError(OutboundChannelUpdateError.reasons.TransferNotFound, params as any),
      );
    }

    // Get active transfers
    const activeRes = await this.getActiveTransfers({ channelAddress: transfer.channelAddress });
    if (activeRes.isError) {
      return Result.fail(activeRes.getError()!);
    }
    const disputeRes = await this.chainService.sendDisputeTransferTx(transfer.transferId, activeRes.getValue());
    if (disputeRes.isError) {
      return Result.fail(disputeRes.getError()!);
    }
    return Result.ok({ transactionHash: disputeRes.getValue().hash });
  }

  private async defundTransfer(
    params: EngineParams.DefundTransfer,
  ): Promise<Result<ChannelRpcMethodsResponsesMap[typeof ChannelRpcMethods.chan_defundTransfer], Error>> {
    const transferRes = await this.getTransferState(params);
    if (transferRes.isError) {
      return Result.fail(transferRes.getError()!);
    }
    const transfer = transferRes.getValue();
    if (!transfer) {
      return Result.fail(
        new OutboundChannelUpdateError(OutboundChannelUpdateError.reasons.TransferNotFound, params as any),
      );
    }

    if (!transfer.inDispute) {
      return Result.fail(new Error("Transfer not in dispute"));
    }

    const defundRes = await this.chainService.sendDefundTransferTx(transfer);
    if (defundRes.isError) {
      return Result.fail(defundRes.getError()!);
    }
    return Result.ok({ transactionHash: defundRes.getValue().hash });
  }

  // JSON RPC interface -- this will accept:
  // - "chan_deposit"
  // - "chan_createTransfer"
  // - "chan_resolveTransfer"
  // - etc.
  public async request<T extends ChannelRpcMethod>(
    payload: EngineParams.RpcRequest,
  ): Promise<ChannelRpcMethodsResponsesMap[T]> {
    this.logger.debug({ payload, method: "request" }, "Method called");
    const validate = ajv.compile(EngineParams.RpcRequestSchema);
    const valid = validate(payload);
    if (!valid) {
      // dont use result type since this could go over the wire
      // TODO: how to represent errors over the wire?
      this.logger.error({ method: "request", payload, ...(validate.errors ?? {}) });
      throw new Error(validate.errors?.map(err => err.message).join(","));
    }

    const methodName = payload.method.replace("chan_", "");
    if (typeof this[methodName] !== "function") {
      throw new Error(`Invalid method: ${methodName}`);
    }
    this.logger.info({ methodName }, "Method called");

    // every method must be a result type
    const res = await this[methodName](payload.params);
    if (res.isError) {
      throw res.getError();
    }
    return res.getValue();
  }

  ///////////////////////////////////
  // EVENT METHODS

  public on<T extends EngineEvent>(
    event: T,
    callback: (payload: EngineEventMap[T]) => void | Promise<void>,
    filter: (payload: EngineEventMap[T]) => boolean = () => true,
  ): void {
    this.evts[event].pipe(filter).attach(callback);
  }

  public once<T extends EngineEvent>(
    event: T,
    callback: (payload: EngineEventMap[T]) => void | Promise<void>,
    filter: (payload: EngineEventMap[T]) => boolean = () => true,
  ): void {
    this.evts[event].pipe(filter).attachOnce(callback);
  }

  public waitFor<T extends EngineEvent>(
    event: T,
    timeout: number,
    filter: (payload: EngineEventMap[T]) => boolean = () => true,
  ): Promise<EngineEventMap[T]> {
    return this.evts[event].pipe(filter).waitFor(timeout);
  }

  public off<T extends EngineEvent>(event?: T): void {
    if (event) {
      this.evts[event].detach();
      return;
    }

    Object.keys(EngineEvents).forEach(k => this.evts[k].detach());
  }
}
