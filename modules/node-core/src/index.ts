import { Vector } from "@connext/vector-engine";
import {
  ChainAddresses,
  ChainProviders,
  IChannelSigner,
  ILockService,
  IMessagingService,
  INodeCoreStore,
  IEngineStore,
  ConditionalTransferParams,
  ResolveConditionParams,
  WithdrawParams,
  TransferParams,
  DepositParams,
  CreateTransferParams,
  ResolveTransferParams,
  EngineEventName,
  ConditionalTransferType,
  Result,
  IVectorEngine,
  ChannelUpdateError,
  ConditionalTransferResponse,
} from "@connext/vector-types";
import Pino from "pino";

import { InvalidTransferType } from "./errors";
import {
  convertConditionalTransferParams,
  convertResolveConditionParams,
  convertWithdrawParams,
} from "./paramConverter";
import { SetupInput } from "./types";

export class NodeCore {
  private constructor(
    private readonly messaging: IMessagingService,
    private readonly store: INodeCoreStore,
    private readonly engine: IVectorEngine,
    private readonly chainProviders: ChainProviders,
    private readonly chainAddresses: ChainAddresses,
    private readonly logger: Pino.BaseLogger,
  ) {}

  static async connect(
    messaging: IMessagingService,
    lock: ILockService,
    store: INodeCoreStore,
    signer: IChannelSigner,
    chainProviders: ChainProviders,
    chainAddresses: ChainAddresses,
    logger: Pino.BaseLogger,
  ): Promise<NodeCore> {
    const engine = await Vector.connect(messaging, lock, store as IEngineStore, signer, chainProviders, logger);
    const nodeCore = new NodeCore(messaging, store, engine, chainProviders, chainAddresses, logger);
    await nodeCore.setupListener();
    return nodeCore;
  }

  public async setupListener(): Promise<void> {
    // unlock transfer if encrypted preimage exists
    this.engine.on(
      EngineEventName.CHANNEL_UPDATE_EVENT,
      (data) => {
        if (!data.updatedChannelState.meta.encryptedPreImage) {
        }
      },
      (data) => data.updatedChannelState.meta.recipient === this.engine.publicIdentifier,
    );

    // subscribe to isAlive
  }

  public async setup(params: SetupInput): Promise<Result<any>> {
    return this.engine.setup({
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

  public async deposit(params: DepositParams): Promise<Result<any>> {
    // TODO we need a deposit response here
    return this.engine.deposit(params);
  }

  public async conditionalTransfer<T extends ConditionalTransferType = any>(
    params: ConditionalTransferParams<T>,
  ): Promise<Result<ConditionalTransferResponse, InvalidTransferType | ChannelUpdateError>> {
    // TODO types
    // TODO input validation
    const channel = await this.store.getChannelState(params.channelAddress);
    if (!channel) {
      // error
    }

    // First, get translated `create` params using the passed in conditional transfer ones
    const createResult = convertConditionalTransferParams(params, this.chainAddresses, channel!);
    if (createResult.isError) {
      return Result.fail(createResult.getError()!);
    }
    const createParams = createResult.getValue();
    const engineResult = await this.engine.createTransfer(createParams);
    if (engineResult.isError) {
      return Result.fail(engineResult.getError()!);
    }
    const res = engineResult.getValue();
    return Result.ok({ routingId: params.routingId });
  }

  public async resolveCondition(params: ResolveConditionParams): Promise<Result<any>> {
    // TODO types
    // TODO input validation

    // First, get translated `resolve` params using the passed in resolve condition ones
    const resolveParams: ResolveTransferParams = await convertResolveConditionParams(params);
    return this.engine.resolveTransfer(resolveParams);
  }

  public async withdraw(params: WithdrawParams): Promise<Result<any>> {
    // TODO types
    // TODO input validation

    const withdrawParams: CreateTransferParams = await convertWithdrawParams(params, this.chainAddresses);
    return this.engine.createTransfer(withdrawParams);
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
