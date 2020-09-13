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
} from "@connext/vector-types";
import { Vector } from "@connext/vector-engine";

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
  public connected: boolean = true;

  constructor(readonly vector: Vector, readonly store: IEngineStore, readonly signer: IChannelSigner) {}

  public async send<T extends ChannelMethods>(payload: JsonRpcRequest): Promise<any> {
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
      case ChannelMethods.chan_walletDeposit:
        result = await this.walletDeposit(params);
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

  public on = (event: string | EventName | MethodName, listener: (...args: any[]) => void): any => {
    this.cfCore.on(event as any, listener);
    return this.cfCore;
  };

  public removeAllListeners = (): any => {
    return this.cfCore.removeAllListeners();
  };

  public once = (event: string | EventName | MethodName, listener: (...args: any[]) => void): any => {
    this.cfCore.once(event as any, listener);
    return this.cfCore;
  };

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

  private walletDeposit = async (params: WalletDepositParams): Promise<string> => {
    const recipient = this.config.multisigAddress;
    if (!recipient) {
      throw new Error(`Cannot make deposit without channel created - missing multisigAddress`);
    }
    let hash;
    const gasPrice = getGasPrice(this.signer.provider);
    if (params.assetId === AddressZero) {
      const tx = await this.signer.sendTransaction({
        to: recipient,
        value: toBN(params.amount),
        gasPrice,
      });
      hash = tx.hash;
      await tx.wait();
    } else {
      const erc20 = new Contract(params.assetId, ERC20.abi, this.signer);
      const tx = await erc20.transfer(recipient, toBN(params.amount), { gasPrice });
      hash = tx.hash;
      await tx.wait();
    }
    return hash;
  };

  private getUserWithdrawals = async (): Promise<WithdrawalMonitorObject[]> => {
    return this.store.getUserWithdrawals();
  };

  private setUserWithdrawal = async (value: WithdrawalMonitorObject, remove: boolean = false): Promise<void> => {
    if (remove) {
      return this.store.removeUserWithdrawal(value);
    }
    return this.store.saveUserWithdrawal(value);
  };

  private setStateChannel = async (
    channel: StateChannelJSON,
    setupCommitment: MinimalTransaction,
    setStateCommitments: [string /* appIdentityHash */, SetStateCommitmentJSON][],
    conditionalCommitments: [string /* appIdentityHash */, ConditionalTransactionCommitmentJSON][],
  ): Promise<void> => {
    await this.store.updateSchemaVersion();
    // save the channel + setup commitment + latest free balance set state
    const freeBalanceSetStates = setStateCommitments
      .filter(([id, json]) => id === channel.freeBalanceAppInstance.identityHash)
      .sort((a, b) => toBN(b[1].versionNumber).sub(toBN(a[1].versionNumber)).toNumber());

    if (!freeBalanceSetStates[0]) {
      throw new Error(`Could not find latest free balance set state commitment: ${stringify(freeBalanceSetStates)}`);
    }
    await this.store.createStateChannel(channel, setupCommitment, freeBalanceSetStates[0][1]);
    // save all the app proposals + set states
    const proposals = [...channel.proposedAppInstances]
      .map(([id, json]) => json)
      .sort((a, b) => a.appSeqNo - b.appSeqNo);
    for (const proposal of proposals) {
      const setState = setStateCommitments.find(
        ([id, json]) => id === proposal.identityHash && toBN(json.versionNumber).eq(1),
      );
      if (!setState) {
        throw new Error(`Could not find set state commitment for proposal ${proposal.identityHash}`);
      }
      const conditional = conditionalCommitments.find(([id, json]) => id === proposal.identityHash);
      if (!conditional) {
        throw new Error(`Could not find conditional commitment for proposal ${proposal.identityHash}`);
      }
      await this.store.createAppProposal(
        channel.multisigAddress,
        proposal,
        proposal.appSeqNo,
        setState[1],
        conditional[1],
        channel,
      );
    }
    // save all the app instances + conditionals
    const appInstances = [...channel.appInstances].map(([id, json]) => json).sort((a, b) => a.appSeqNo - b.appSeqNo);
    for (const app of appInstances) {
      if (app.identityHash === channel.freeBalanceAppInstance.identityHash) {
        continue;
      }
      const conditional = conditionalCommitments.find(([id, _]) => id === app.identityHash);
      if (!conditional) {
        throw new Error(`Could not find set state commitment for proposal ${app.identityHash}`);
      }
      await this.store.createAppInstance(
        channel.multisigAddress,
        app,
        channel.freeBalanceAppInstance, // fb state saved on create
        ({
          appIdentityHash: channel.freeBalanceAppInstance.identityHash,
          versionNumber: app.appSeqNo,
        } as unknown) as SetStateCommitmentJSON,
        channel,
      );
    }

    // recreate state channel now to update the fields purely based on the restored state
    // TODO: should probably have a method in the store specifically to do this
    await this.store.createStateChannel(channel, setupCommitment, freeBalanceSetStates[0][1]);
  };

  private restoreState = async (): Promise<void> => {
    await this.store.restore();
  };

  private async getSchemaVersion() {
    return this.store.getSchemaVersion();
  }

  private async updateSchemaVersion(version?: number) {
    return this.store.updateSchemaVersion(version);
  }

  private async enableChannel() {
    const channel = await this.node.getChannel();

    let multisigAddress: string;

    if (channel) {
      multisigAddress = channel.multisigAddress;
    } else {
      this.logger.debug("no channel detected, creating channel..");
      const creationEventData = await new Promise(async (resolve, reject) => {
        this.cfCore.once(EventNames.CREATE_CHANNEL_EVENT, (data: CreateChannelMessage): void => {
          this.logger.debug(`Received CREATE_CHANNEL_EVENT`);
          return resolve(data.data);
        });

        this.cfCore.once(EventNames.SETUP_FAILED_EVENT, (msg): void => {
          return reject(new Error(msg.data.error));
        });

        try {
          const creationData = await this.node.createChannel();
          this.logger.debug(`Created channel, transaction: ${stringify(creationData)}`);
        } catch (e) {
          return reject(e);
        }
      });
      if (!creationEventData) {
        throw new Error(`Could not create channel`);
      }
      multisigAddress = (creationEventData as MethodResults.CreateChannel).multisigAddress;
    }

    this.logger.debug(`multisigAddress: ${multisigAddress}`);
    this.config.multisigAddress = multisigAddress;

    return this.config;
  }

  private routerDispatch = async (method: string, params: any = {}) => {
    const ret = await this.cfCore.rpcRouter.dispatch({
      id: Date.now(),
      methodName: method,
      parameters: deBigNumberifyJson(params),
    });
    return ret.result.result;
  };
}
