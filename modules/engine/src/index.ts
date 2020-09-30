import { VectorChainReader } from "@connext/vector-contracts";
import { Vector } from "@connext/vector-protocol";
import {
  ChainAddresses,
  ChainProviders,
  FullChannelState,
  IChannelSigner,
  ILockService,
  IMessagingService,
  IVectorProtocol,
  Result,
  JsonRpcProvider,
  EngineParams,
  OutboundChannelUpdateError,
  ChannelRpcMethodsResponsesMap,
  IVectorEngine,
  EngineEventMap,
  IEngineStore,
  EngineEvent,
  EngineEvents,
  ChannelRpcMethod,
  FullTransferState,
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

const ajv = new Ajv();

export type EngineEvtContainer = { [K in keyof EngineEventMap]: Evt<EngineEventMap[K]> };

export class VectorEngine implements IVectorEngine {
  // Setup event container to emit events from vector
  // FIXME: Is this JSON RPC compatible?
  private readonly evts: EngineEvtContainer = getEngineEvtContainer();

  private constructor(
    private readonly messaging: IMessagingService,
    private readonly store: IEngineStore,
    private readonly vector: IVectorProtocol,
    private readonly chainProviders: ChainProviders,
    private readonly chainAddresses: ChainAddresses,
    private readonly logger: pino.BaseLogger,
    private readonly signer: IChannelSigner,
  ) {}

  static async connect(
    messaging: IMessagingService,
    lock: ILockService,
    store: IEngineStore,
    signer: IChannelSigner,
    chainProviders: ChainProviders,
    chainAddresses: ChainAddresses,
    logger: pino.BaseLogger,
  ): Promise<VectorEngine> {
    const hydratedProviders = {};
    Object.entries(chainProviders).forEach(([chainId, providerUrl]) => {
      hydratedProviders[chainId] = new JsonRpcProvider(providerUrl);
    });
    const chainService = new VectorChainReader(hydratedProviders, logger.child({ module: "VectorChainReader" }));
    const vector = await Vector.connect(
      messaging,
      lock,
      store,
      signer,
      chainService,
      logger.child({ module: "VectorProtocol" }),
    );
    const engine = new VectorEngine(messaging, store, vector, chainProviders, chainAddresses, logger, signer);
    await engine.setupListener();
    logger.info({ vector: vector.publicIdentifier }, "Vector Engine connected 🚀!");
    return engine;
  }

  // TODO: create injected validation that handles submitting transactions
  // IFF there was a fee involved. Should:
  // - check if fee > 0
  //    - yes && my withdrawal: make sure transaction hash is included in
  //      the meta (verify tx)

  private async setupListener(): Promise<void> {
    await setupEngineListeners(
      this.evts,
      this.vector,
      this.messaging,
      this.signer,
      this.store,
      this.chainAddresses,
      this.logger,
    );
  }

  private async getChannelState(
    params: EngineParams.GetChannelState,
  ): Promise<Result<FullChannelState | undefined, Error | OutboundChannelUpdateError>> {
    const validate = ajv.compile(EngineParams.GetChannelStateSchema);
    const valid = validate(params);
    if (!valid) {
      return Result.fail(new Error(validate.errors?.map(err => err.message).join(",")));
    }
    const channel = await this.vector.getChannelState(params.channelAddress);
    return Result.ok(channel);
  }

  private async getTransferStateByRoutingId(
    params: EngineParams.GetTransferStateByRoutingId,
  ): Promise<Result<FullTransferState | undefined, Error>> {
    const validate = ajv.compile(EngineParams.GetTransferStateByRoutingIdSchema);
    const valid = validate(params);
    if (!valid) {
      return Result.fail(new Error(validate.errors?.map(err => err.message).join(",")));
    }
    const transfer = await this.store.getTransferByRoutingId(params.channelAddress, params.routingId);
    return Result.ok(transfer);
  }

  private async getChannelStateByParticipants(
    params: EngineParams.GetChannelStateByParticipants,
  ): Promise<Result<FullChannelState | undefined, Error | OutboundChannelUpdateError>> {
    const validate = ajv.compile(EngineParams.GetChannelStateByParticipantsSchema);
    const valid = validate(params);
    if (!valid) {
      return Result.fail(new Error(validate.errors?.map(err => err.message).join(",")));
    }
    const channel = await this.vector.getChannelStateByParticipants(params.alice, params.bob, params.chainId);
    return Result.ok(channel);
  }

  private async getChannelStates(): Promise<Result<FullChannelState[], Error | OutboundChannelUpdateError>> {
    const channel = await this.vector.getChannelStates();
    return Result.ok(channel);
  }

  private async setup(
    params: EngineParams.Setup,
  ): Promise<Result<FullChannelState, OutboundChannelUpdateError | Error>> {
    this.logger.info({ params, method: "setup" }, "Method called");
    const validate = ajv.compile(EngineParams.SetupSchema);
    const valid = validate(params);
    if (!valid) {
      return Result.fail(new Error(validate.errors?.map(err => err.message).join(",")));
    }

    return this.vector.setup({
      counterpartyIdentifier: params.counterpartyIdentifier,
      timeout: params.timeout,
      networkContext: {
        linkedTransferDefinition: this.chainAddresses[params.chainId].linkedTransferDefinition,
        withdrawDefinition: this.chainAddresses[params.chainId].withdrawDefinition,
        channelMastercopyAddress: this.chainAddresses[params.chainId].channelMastercopyAddress,
        channelFactoryAddress: this.chainAddresses[params.chainId].channelFactoryAddress,
        chainId: params.chainId,
        providerUrl: this.chainProviders[params.chainId],
      },
    });
  }

  private async deposit(
    params: EngineParams.Deposit,
  ): Promise<Result<FullChannelState, OutboundChannelUpdateError | Error>> {
    const validate = ajv.compile(EngineParams.DepositSchema);
    const valid = validate(params);
    if (!valid) {
      return Result.fail(new Error(validate.errors?.map(err => err.message).join(",")));
    }

    return this.vector.deposit(params);
  }

  private async createTransfer(
    params: EngineParams.ConditionalTransfer,
  ): Promise<Result<FullChannelState, InvalidTransferType | OutboundChannelUpdateError>> {
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
    const createResult = convertConditionalTransferParams(params, this.signer, channel!, this.chainAddresses);
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

  private async resolveTransfer(params: EngineParams.ResolveTransfer): Promise<Result<FullChannelState, Error>> {
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

  private async withdraw(params: EngineParams.Withdraw): Promise<Result<FullChannelState, Error>> {
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
    const createResult = await convertWithdrawParams(params, this.signer, channel!, this.chainAddresses);
    if (createResult.isError) {
      return Result.fail(createResult.getError()!);
    }
    const createParams = createResult.getValue();
    const protocolRes = await this.vector.create(createParams);
    if (protocolRes.isError) {
      return Result.fail(protocolRes.getError()!);
    }
    const res = protocolRes.getValue();

    // TODO should we wait for the resolve here?

    return Result.ok(res); // TODO what do we return here?
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
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    filter: (payload: EngineEventMap[T]) => boolean = (_payload: EngineEventMap[T]) => true,
  ): void {
    this.evts[event].pipe(filter).attach(callback);
  }

  public once<T extends EngineEvent>(
    event: T,
    callback: (payload: EngineEventMap[T]) => void | Promise<void>,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    filter: (payload: EngineEventMap[T]) => boolean = (_payload: EngineEventMap[T]) => true,
  ): void {
    this.evts[event].pipe(filter).attachOnce(callback);
  }

  public waitFor<T extends EngineEvent>(
    event: T,
    timeout: number,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    filter: (payload: EngineEventMap[T]) => boolean = (_payload: EngineEventMap[T]) => true,
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
