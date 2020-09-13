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
} from "@connext/vector-types";

import {
  convertConditionalTransferParams,
  convertResolveConditionParams,
  convertWithdrawParams,
} from "./paramConverter";

export class NodeCore {
  private constructor(
    private readonly messaging: IMessagingService,
    private readonly store: INodeCoreStore,
    private readonly engine: Vector,
    private readonly chainProviders: ChainProviders,
    private readonly chainAddresses: ChainAddresses,
  ) {}

  static async connect(
    messaging: IMessagingService,
    lock: ILockService,
    store: INodeCoreStore,
    signer: IChannelSigner,
    chainProviders: ChainProviders,
    chainAddresses: ChainAddresses,
  ): Promise<NodeCore> {
    const engine = await Vector.connect(messaging, lock, store as IEngineStore, signer, chainProviders);
    const nodeCore = new NodeCore(messaging, store, engine, chainProviders, chainAddresses);
    await nodeCore.setupListener();
    return nodeCore;
  }

  public async setupListener(): Promise<void> {}

  public async deposit(params: DepositParams): Promise<any> {
    // TODO we need a deposit response here
    return this.engine.deposit(params);
  }

  public async conditionalTransfer(params: ConditionalTransferParams): Promise<any> {
    // TODO types
    // TODO input validation

    // First, get translated `create` params using the passed in conditional transfer ones
    const createParams: CreateTransferParams = await convertConditionalTransferParams(params, this.chainAddresses);
    return this.engine.createTransfer(createParams);
  }

  public async resolveCondition(params: ResolveConditionParams): Promise<any> {
    // TODO types
    // TODO input validation

    // First, get translated `resolve` params using the passed in resolve condition ones
    const resolveParams: ResolveTransferParams = await convertResolveConditionParams(params);
    return this.engine.resolveTransfer(resolveParams);
  }

  public async withdraw(params: WithdrawParams): Promise<any> {
    // TODO types
    // TODO input validation

    const withdrawParams: CreateTransferParams = await convertWithdrawParams(params, this.chainAddresses);
    return this.engine.createTransfer(withdrawParams);
  }

  public async transfer(params: TransferParams): Promise<any> {
    // TODO input validation

    // TODO convert this into linked transfer to recipient params in conditionalTransfer
    let updatedParams;
    return this.conditionalTransfer(updatedParams);
  }
}
