import { Vector } from "@connext/vector-protocol";
import {
  Address,
  ChainAddresses,
  ChainProviders,
  ChannelUpdateError,
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
  SetupInput,
  SetupInputSchema,
  DepositInputSchema,
  DepositInput,
  RpcRequestInput,
  EthAddressSchema,
} from "@connext/vector-types";
import pino from "pino";
import Ajv from "ajv";

import { InvalidTransferType } from "./errors";
import {
  convertConditionalTransferParams,
  convertResolveConditionParams,
  convertWithdrawParams,
} from "./paramConverter";
import { setupListeners } from "./listeners";

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
    const vector = await Vector.connect(
      messaging,
      lock,
      store as IVectorStore,
      signer,
      chainProviders,
      logger.child({ module: "VectorProtocol" }),
    );
    const engine = new VectorEngine(messaging, store, vector, chainProviders, chainAddresses, logger);
    await engine.setupListeners();

    // It should clean up unresolved transfers -- note, is there a way to just queue up calls here and return? That way we're not blocking startup?

    // It should check to see if a deposit happened and automatically call the deposit protocol
    logger.info("Vector Engine connected 🚀!");
    return engine;
  }

  public async setupListeners(): Promise<void> {
    // return setupListeners();
  }

  public async setup(params: SetupInput): Promise<Result<any, ChannelUpdateError | Error>> {
    const validate = ajv.compile(SetupInputSchema);
    const valid = validate(params);
    if (!valid) {
      return Result.fail(new Error(validate.errors?.join()));
    }

    return this.vector.setup({
      counterpartyIdentifier: params.counterpartyIdentifier,
      timeout: params.timeout,
      networkContext: {
        adjudicatorAddress: this.chainAddresses[params.chainId].adjudicatorAddress,
        linkedTransferDefinition: this.chainAddresses[params.chainId].linkedTransferDefinition,
        withdrawDefinition: this.chainAddresses[params.chainId].withdrawDefinition,
        vectorChannelMastercopyAddress: this.chainAddresses[params.chainId].vectorChannelMastercopyAddress,
        channelFactoryAddress: this.chainAddresses[params.chainId].channelFactoryAddress,
        chainId: params.chainId,
        providerUrl: this.chainProviders[params.chainId],
      },
    });
  }

  public async deposit(params: DepositInput): Promise<Result<FullChannelState, ChannelUpdateError | Error>> {
    const validate = ajv.compile(DepositInputSchema);
    const valid = validate(params);
    if (!valid) {
      return Result.fail(new Error(validate.errors?.join()));
    }

    return this.vector.deposit(params);
  }

  public async conditionalTransfer<T extends ConditionalTransferType = any>(
    params: ConditionalTransferParams<T>,
  ): Promise<Result<ConditionalTransferResponse, InvalidTransferType | ChannelUpdateError>> {
    // TODO types
    // TODO input validation
    const channel = await this.store.getChannelState(params.channelAddress);
    if (!channel) {
      return Result.fail(new ChannelUpdateError(ChannelUpdateError.reasons.ChannelNotFound));
    }

    // First, get translated `create` params using the passed in conditional transfer ones
    const createResult = convertConditionalTransferParams(params, this.chainAddresses, channel!);
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

  public async getChannelState(channelAddress: Address): Promise<Result<FullChannelState, Error | ChannelUpdateError>> {
    const validate = ajv.compile(EthAddressSchema);
    const valid = validate(channelAddress);
    if (!valid) {
      return Result.fail(new Error(validate.errors?.join()));
    }
    const channel = await this.store.getChannelState(channelAddress);
    if (!channel) {
      return Result.fail(new ChannelUpdateError(ChannelUpdateError.reasons.ChannelNotFound));
    }
    return Result.ok(channel);
  }

  public async resolveCondition(params: ResolveConditionParams): Promise<Result<any>> {
    // TODO types
    // TODO input validation

    // First, get translated `resolve` params using the passed in resolve condition ones
    const resolveParams: ResolveTransferParams = await convertResolveConditionParams(params);
    return this.vector.resolve(resolveParams);
  }

  public async withdraw(params: WithdrawParams): Promise<Result<any>> {
    // TODO types
    // TODO input validation

    const withdrawParams: CreateTransferParams = await convertWithdrawParams(params, this.chainAddresses);
    return this.vector.create(withdrawParams);
  }

  public async transfer(params: TransferParams): Promise<Result<any>> {
    // TODO input validation

    // TODO convert this into linked transfer to recipient params in conditionalTransfer
    let updatedParams;
    return this.conditionalTransfer(updatedParams);
  }

  // JSON RPC interface -- this will accept:
  // - "vector_deposit"
  // - "vector_createTransfer"
  // - "vector_resolveTransfer"
  // TODO add rpc request type
  public async request(payload: RpcRequestInput): Promise<any> {
    const validate = ajv.compile(DepositInputSchema);
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
