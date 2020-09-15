import { Vector } from "@connext/vector-protocol";
import {
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
} from "@connext/vector-types";
import Pino from "pino";
import Ajv from "ajv";

import { InvalidTransferType } from "./errors";
import {
  convertConditionalTransferParams,
  convertResolveConditionParams,
  convertWithdrawParams,
} from "./paramConverter";
import { SetupInput, SetupInputSchema, DepositInputSchema, DepositInput } from "./types";

const ajv = new Ajv();

export class VectorEngine {
  private constructor(
    private readonly messaging: IMessagingService,
    private readonly store: IVectorStore,
    private readonly vector: IVectorProtocol,
    private readonly chainProviders: ChainProviders,
    private readonly chainAddresses: ChainAddresses,
    private readonly logger: Pino.BaseLogger,
  ) {}

  static async connect(
    messaging: IMessagingService,
    lock: ILockService,
    store: IVectorStore,
    signer: IChannelSigner,
    chainProviders: ChainProviders,
    chainAddresses: ChainAddresses,
    logger: Pino.BaseLogger,
  ): Promise<VectorEngine> {
    const vector = await Vector.connect(messaging, lock, store as IVectorStore, signer, chainProviders, logger);
    const engine = new VectorEngine(messaging, store, vector, chainProviders, chainAddresses, logger);
    await engine.setupListener();
    return engine;
  }

  public async setupListener(): Promise<void> {
    // unlock transfer if encrypted preimage exists
    this.vector.on(
      ProtocolEventName.CHANNEL_UPDATE_EVENT,
      (data) => {
        if (!data.updatedChannelState.meta.encryptedPreImage) {
        }
      },
      (data) => data.updatedChannelState.meta.recipient === this.vector.publicIdentifier,
    );

    // subscribe to isAlive
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
    const protocolRes = await this.vector.createTransfer(createParams);
    if (protocolRes.isError) {
      return Result.fail(protocolRes.getError()!);
    }
    const res = protocolRes.getValue();
    return Result.ok({ routingId: params.routingId });
  }

  public async resolveCondition(params: ResolveConditionParams): Promise<Result<any>> {
    // TODO types
    // TODO input validation

    // First, get translated `resolve` params using the passed in resolve condition ones
    const resolveParams: ResolveTransferParams = await convertResolveConditionParams(params);
    return this.vector.resolveTransfer(resolveParams);
  }

  public async withdraw(params: WithdrawParams): Promise<Result<any>> {
    // TODO types
    // TODO input validation

    const withdrawParams: CreateTransferParams = await convertWithdrawParams(params, this.chainAddresses);
    return this.vector.createTransfer(withdrawParams);
  }

  public async transfer(params: TransferParams): Promise<Result<any>> {
    // TODO input validation

    // TODO convert this into linked transfer to recipient params in conditionalTransfer
    let updatedParams;
    return this.conditionalTransfer(updatedParams);
  }

  public async addToQueuedUpdates(params: any): Promise<Result<any>> {
    return Result.ok(undefined);
    // TODO what kinds of params do we want this to accept?
    // First convert the update into correct type
    // Then store in queued updates table
    // return this.store.addToQueuedUpdates();
  }

  // JSON RPC interface -- this will accept:
  // - "vector_deposit"
  // - "vector_createTransfer"
  // - "vector_resolveTransfer"
  // TODO add rpc request type
  public async request(payload: any) {
    if (!payload.method.startsWith(`vector_`)) {
      throw new Error(`TODO`);
    }
    const methodName = payload.method.replace("vector_", "");
    if (typeof this[methodName] !== "function") {
      throw new Error(`TODO`);
    }
    await this[methodName](payload.params);
  }
}
