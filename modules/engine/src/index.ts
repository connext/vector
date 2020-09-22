import { VectorOnchainService } from "@connext/vector-contracts";
import { Vector } from "@connext/vector-protocol";
import {
  Address,
  ChainAddresses,
  ChainProviders,
  ConditionalTransferParams,
  ConditionalTransferResponse,
  ConditionalTransferType,
  CreateTransferParams,
  FullChannelState,
  IChannelSigner,
  ILockService,
  IMessagingService,
  IVectorProtocol,
  IVectorStore,
  ProtocolEventName,
  ResolveConditionParams,
  ResolveTransferParams,
  Result,
  TransferParams,
  WithdrawParams,
  JsonRpcProvider,
  EngineParams,
  OutboundChannelUpdateError,
  TAddress,
} from "@connext/vector-types";
import pino from "pino";
import Ajv from "ajv";

import { InvalidTransferType } from "./errors";
import {
  convertConditionalTransferParams,
  convertResolveConditionParams,
  convertWithdrawParams,
} from "./paramConverter";

const ajv = new Ajv();

export class VectorEngine {
  private constructor(
    private readonly messaging: IMessagingService,
    private readonly store: IVectorStore,
    private readonly vector: IVectorProtocol,
    private readonly chainProviders: ChainProviders,
    private readonly chainAddresses: ChainAddresses,
    private readonly logger: pino.BaseLogger,
  ) {}

  static async connect(
    messaging: IMessagingService,
    lock: ILockService,
    store: IVectorStore,
    signer: IChannelSigner,
    chainProviders: ChainProviders,
    chainAddresses: ChainAddresses,
    logger: pino.BaseLogger,
  ): Promise<VectorEngine> {
    const hydratedProviders = {};
    Object.entries(chainProviders).forEach(([chainId, providerUrl]) => {
      hydratedProviders[chainId] = new JsonRpcProvider(providerUrl);
    });
    const chainService = new VectorOnchainService(hydratedProviders);
    const vector = await Vector.connect(
      messaging,
      lock,
      store as IVectorStore,
      signer,
      chainService,
      logger.child({ module: "VectorProtocol" }),
    );
    const engine = new VectorEngine(messaging, store, vector, chainProviders, chainAddresses, logger);
    await engine.setupListener();
    logger.info("Vector Engine connected 🚀!");
    return engine;
  }

  private async setupListener(): Promise<void> {
    // unlock transfer if encrypted preimage exists
    this.vector.on(
      ProtocolEventName.CHANNEL_UPDATE_EVENT,
      (data) => {
        if (!data.updatedChannelState.latestUpdate?.details.meta.encryptedPreImage) {
        }
      },
      (data) => data.updatedChannelState.latestUpdate?.details.meta?.recipient === this.vector.publicIdentifier,
    );

    // TODO: this subscription should be part of the MessagingService
    this.messaging.subscribe(`${this.vector.publicIdentifier}.*.check-in`, async () => {
      // pull channel out of subject
    });
  }

  private async setup(params: EngineParams.Setup): Promise<Result<any, OutboundChannelUpdateError | Error>> {
    this.logger.info({ params, method: "setup" }, "Method called");
    const validate = ajv.compile(EngineParams.SetupSchema);
    const valid = validate(params);
    if (!valid) {
      return Result.fail(new Error(validate.errors?.join()));
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
      return Result.fail(new Error(validate.errors?.join()));
    }

    return this.vector.deposit(params);
  }

  private async conditionalTransfer<T extends ConditionalTransferType = any>(
    params: ConditionalTransferParams<T>,
  ): Promise<Result<ConditionalTransferResponse, InvalidTransferType | OutboundChannelUpdateError>> {
    // TODO types
    // TODO input validation
    const channel = await this.store.getChannelState(params.channelAddress);
    if (!channel) {
      return Result.fail(
        new OutboundChannelUpdateError(OutboundChannelUpdateError.reasons.ChannelNotFound, params as any),
      );
    }

    // First, get translated `create` params using the passed in conditional transfer ones
    const createResult = convertConditionalTransferParams(params, channel!);
    if (createResult.isError) {
      return Result.fail(createResult.getError()!);
    }
    const createParams = createResult.getValue();
    const protocolRes = await this.vector.create(createParams);
    if (protocolRes.isError) {
      return Result.fail(protocolRes.getError()!);
    }
    const res = protocolRes.getValue();
    return Result.ok({ routingId: params.routingId });
  }

  private async getChannelState(
    channelAddress: Address,
  ): Promise<Result<FullChannelState, Error | OutboundChannelUpdateError>> {
    const validate = ajv.compile(TAddress);
    const valid = validate(channelAddress);
    if (!valid) {
      return Result.fail(new Error(validate.errors?.join()));
    }
    const channel = await this.store.getChannelState(channelAddress);
    if (!channel) {
      return Result.fail(
        new OutboundChannelUpdateError(OutboundChannelUpdateError.reasons.ChannelNotFound, channelAddress as any),
      );
    }
    return Result.ok(channel);
  }

  private async resolveCondition(params: ResolveConditionParams): Promise<Result<any>> {
    // TODO types
    // TODO input validation

    // First, get translated `resolve` params using the passed in resolve condition ones
    const resolveParams: ResolveTransferParams = await convertResolveConditionParams(params);
    return this.vector.resolve(resolveParams);
  }

  private async withdraw(params: WithdrawParams): Promise<Result<any>> {
    // TODO types
    // TODO input validation

    const withdrawParams: CreateTransferParams = await convertWithdrawParams(params, this.chainAddresses);
    return this.vector.create(withdrawParams);
  }

  private async transfer(params: TransferParams): Promise<Result<any>> {
    // TODO input validation

    // TODO convert this into linked transfer to recipient params in conditionalTransfer
    let updatedParams;
    return this.conditionalTransfer(updatedParams);
  }

  // JSON RPC interface -- this will accept:
  // - "vector_deposit"
  // - "vector_createTransfer"
  // - "vector_resolveTransfer"
  public async request(payload: EngineParams.RpcRequest): Promise<any> {
    this.logger.info({ payload, method: "request" }, "Method called");
    const validate = ajv.compile(EngineParams.RpcRequestSchema);
    const valid = validate(payload);
    if (!valid) {
      // dont use result type since this could go over the wire
      // TODO: how to represent errors over the wire?
      this.logger.error(validate.errors || {});
      throw new Error(validate.errors?.join());
    }

    const methodName = payload.method.replace("chan_", "");
    if (typeof this[methodName] !== "function") {
      throw new Error(`Invalid method: ${methodName}`);
    }

    // every method must be a result type
    const res = await this[methodName](payload.params);
    if (res.isError) {
      throw res.getError();
    }
    return res.getValue();
  }
}
