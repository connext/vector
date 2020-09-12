import { Vector } from "@connext/vector-engine";
import {
  ChainAddresses,
  ChainProviders,
  IChannelSigner,
  ILockService,
  IMessagingService,
  INodeCoreStore,
  IEngineStore,
} from "@connext/vector-types";
import { Address, DepositParams, CreateTransferParams, ResolveTransferParams } from "@connext/vector-types";
import { convertConditionalTransferParams, convertResolveConditionParams, convertWithdrawParams } from "./paramConverter";

export class NodeCore {
  private constructor(
    private readonly messaging: IMessagingService,
    private readonly store: INodeCoreStore,
    private readonly engineProvider: Vector,
    private readonly chainProviders: ChainProviders,
    private readonly chainAddresses: ChainAddresses
  ) {}

  static async connect(
    messaging: IMessagingService,
    lock: ILockService,
    store: INodeCoreStore,
    signer: IChannelSigner,
    chainProviders: ChainProviders,
    chainAddresses: ChainAddresses,
  ): Promise<NodeCore> {
    const vector = await Vector.connect(messaging, lock, store as IEngineStore, signer, chainProviders, chainAddresses);

    // TODO write this
    const engineProvider = await setupEngineProvider(vector);
    // TODO look at what was done for SDK to relay events
    await setupListener(engineProvider);

    const nodeCore = new NodeCore(messaging, store, engineProvider, chainProviders, chainAddresses);
    return nodeCore;
  }

  public async deposit(params: DepositParams): Promise<any> { // TODO we need a deposit response here
    return this.engineProvider.deposit(params);
  }

  public async conditionalTransfer(params: ConditionalTransferParams): Promise<any> { // TODO types
    // TODO input validation

    // First, get translated `create` params using the passed in conditional transfer ones
    const createParams: CreateTransferParams = await convertConditionalTransferParams(params, this.chainAddresses, this.chainProviders);
    return this.engineProvider.create(createParams);
  }

  public async resolveCondition(params: ResolveConditionParams): Promise<any> { // TODO types
    // TODO input validation

    // First, get translated `resolve` params using the passed in resolve condition ones
    const resolveParams: ResolveTransferParams = await convertResolveConditionParams(params);
    return this.engineProvider.resolve(resolveParams);
  }

  public async withdraw(params: WithdrawParams): Promise<any> { // TODO types
    // TODO input validation

    const withdrawParams: CreateTransferParams = await convertWithdrawParams(params, this.chainAddresses, this.chainProviders);
    return this.engineProvider.create(withdrawParams);
  }

  public async transfer(params: TransferParams): Promise<any> {
    // TODO input validation

    // TODO convert this into linked transfer to recipient params in conditionalTransfer
    let updatedParams;
    return this.conditionalTransfer(updatedParams)
  }
}
