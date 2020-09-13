import {
  ChainProviders,
  IChannelSigner,
  IEngineStore,
  ILockService,
  IMessagingService,
  INodeCoreStore,
  IEngineProvider,
  IRpcConnection,
  JsonRpcRequest,
  ChannelMethods,
  EngineEventName,
  EngineEventPayloadsMap,
} from "@connext/vector-types";
import { Vector } from "@connext/vector-engine";
import { getPublicKeyFromPublicIdentifier } from "@connext/vector-utils";

export const setupEngineProvider = async (
  messaging: IMessagingService,
  lock: ILockService,
  store: INodeCoreStore,
  signer: IChannelSigner,
  chainProviders: ChainProviders,
): Promise<IEngineProvider> => {
  const vector = await Vector.connect(messaging, lock, store as IEngineStore, signer, chainProviders);
};

export class VectorEngineRpcConnection implements IRpcConnection {
  public connected = true;

  constructor(readonly vector: Vector, readonly store: IEngineStore, readonly signer: IChannelSigner) {}

  // TODO: type mapping
  public async send<T extends ChannelMethods>(payload: JsonRpcRequest): Promise<T> {
    const { method, params } = payload;
    let result;
    switch (method) {
      case ChannelMethods.chan_isSigner:
        result = true;
        break;
      case ChannelMethods.chan_config:
        result = {};
        break;
      case ChannelMethods.chan_enable:
        result = await this.enableChannel();
        break;
      case ChannelMethods.chan_setUserWithdrawal:
        result = await this.setUserWithdrawal(params.withdrawalObject, params.remove);
        break;
      case ChannelMethods.chan_getUserWithdrawal:
        result = await this.getUserWithdrawals();
        break;
      case ChannelMethods.chan_signMessage:
        result = await this.signMessage(params.message);
        break;
      case ChannelMethods.chan_encrypt:
        result = await this.encrypt(params.message, params.publicIdentifier);
        break;
      case ChannelMethods.chan_decrypt:
        result = await this.decrypt(params.encryptedPreImage);
        break;
      case ChannelMethods.chan_restoreState:
        result = await this.restoreState();
        break;
      case ChannelMethods.chan_setStateChannel:
        result = await this.setStateChannel(
          params.state,
          params.setupCommitment,
          params.setStateCommitments,
          params.conditionalCommitments,
        );
        break;
      case ChannelMethods.chan_getSchemaVersion:
        result = await this.getSchemaVersion();
        break;
      case ChannelMethods.chan_updateSchemaVersion:
        result = await this.updateSchemaVersion(params.version);
        break;
      default:
        result = await this.routerDispatch(method, params);
        break;
    }
    return result;
  }

  public on<T extends EngineEventName>(
    event: T,
    callback: (payload: EngineEventPayloadsMap[T]) => void | Promise<void>,
    filter?: (payload: EngineEventPayloadsMap[T]) => boolean,
  ): void {
    this.vector.on(event, callback, filter);
  }

  public removeAllListeners = (): any => {};

  public once<T extends EngineEventName>(
    event: T,
    callback: (payload: EngineEventPayloadsMap[T]) => void | Promise<void>,
    filter?: (payload: EngineEventPayloadsMap[T]) => boolean,
  ): void {
    this.vector.once(event as any, callback, filter);
  }

  public open(): Promise<void> {
    return Promise.resolve();
  }

  public close(): Promise<void> {
    return Promise.resolve();
  }

  ///////////////////////////////////////////////
  ///// PRIVATE METHODS

  private signMessage(message: string): Promise<string> {
    return this.signer.signMessage(message);
  }

  private encrypt(message: string, publicIdentifier: string): Promise<string> {
    return this.signer.encrypt(message, getPublicKeyFromPublicIdentifier(publicIdentifier));
  }

  private decrypt(encryptedPreImage: string): Promise<string> {
    return this.signer.decrypt(encryptedPreImage);
  }

  private async getSchemaVersion() {
    return this.store.getSchemaVersion();
  }

  private async updateSchemaVersion(version?: number) {
    return this.store.updateSchemaVersion(version);
  }

  private async enableChannel() {}

  private routerDispatch = async (method: string, parameters: any = {}) => {
    const ret = await this.vector.rpcRouter.dispatch({
      id: Date.now(),
      methodName: method,
      parameters,
    });
    return ret.result.result;
  };
}
