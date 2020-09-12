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

export class NodeCore {
  private constructor(
    private readonly messaging: IMessagingService,
    private readonly store: INodeCoreStore,
    private readonly engine: Vector,
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

    const nodeCore = new NodeCore(messaging, store, vector);
    return nodeCore;
  }
}
