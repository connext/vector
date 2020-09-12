import {
  IEngineStore,
  UpdateParams,
  DepositParams,
  UpdateType,
  CreateTransferParams,
  ResolveTransferParams,
  ILockService,
  IMessagingService,
  ChainProviders,
  IChannelSigner,
  FullChannelState,
  SetupParams,
  ChainAddresses,
} from "@connext/vector-types";
import { providers } from "ethers";
import { Evt } from "evt";
import { VectorChannel, ChannelFactory } from "@connext/vector-contracts";

import { getCreate2MultisigAddress } from "./create2";
import * as sync from "./sync";
import { VectorMessage } from "./types";
import { generateUpdate } from "./update";
import { InboundChannelError, logger } from "./utils";

export type UpdateEvent = {
  direction: "inbound" | "outbound";
  updatedChannelState: FullChannelState;
};

export type EngineEventNames = "CHANNEL_UPDATE_EVENT" | "PROTOCOL_MESSAGE_EVENT" | "PROTOCOL_ERROR_EVENT";

export class Vector {
  private protocolChannelStateEvt = Evt.create<FullChannelState>();
  private protocolChannelErrorEvt = Evt.create<InboundChannelError>();
  private channelUpdateEvt = Evt.create<UpdateEvent>();
  private chainProviders: Map<number, providers.JsonRpcProvider> = new Map<number, providers.JsonRpcProvider>();

  // make it private so the only way to create the class is to use `connect`
  private constructor(
    private readonly messagingService: IMessagingService,
    private readonly lockService: ILockService,
    private readonly storeService: IEngineStore,
    private readonly signer: IChannelSigner,
    private readonly chainProviderUrls: ChainProviders,
    private readonly chainAddresses: ChainAddresses,
  ) {
    Object.entries(chainProviderUrls).forEach(([chainId, providerUrl]) => {
      this.chainProviders.set(parseInt(chainId), new providers.JsonRpcProvider(providerUrl));
    });
  }

  static connect(
    messagingService: IMessagingService,
    lockService: ILockService,
    storeService: IEngineStore,
    signer: IChannelSigner,
    chainProviders: ChainProviders,
    chainAddresses: ChainAddresses,
  ): Promise<Vector> {
    const node = new Vector(messagingService, lockService, storeService, signer, chainProviders, chainAddresses);

    // Handles up asynchronous services and checks to see that
    // channel is `setup` plus is not in dispute
    return node.setupServices();
  }

  get signerAddress(): string {
    return this.signer.address;
  }

  get publicIdentifier(): string {
    return this.signer.publicIdentifier;
  }

  // Primary protocol execution from the leader side
  private async executeUpdate(params: UpdateParams<any>): Promise<FullChannelState> {
    logger.info(`Start executeUpdate`, { params });

    const key = await this.lockService.acquireLock(params.channelAddress);
    const state = await this.storeService.getChannelState(params.channelAddress);
    // NOTE: This is a heavy query, but is required on every update (even if it
    // is not a transfer) due to the general nature of the `validate` api
    const providerUrl = this.chainProviderUrls[state.networkContext.chainId];
    const update = await generateUpdate(params, this.storeService, this.signer);
    const updatedChannelState = await sync.outbound(
      update,
      providerUrl,
      this.storeService,
      this.messagingService,
      this.protocolChannelStateEvt,
      this.protocolChannelErrorEvt,
    );
    this.channelUpdateEvt.post({
      direction: "outbound",
      updatedChannelState,
    });
    await this.lockService.releaseLock(params.channelAddress, key);
    return updatedChannelState;
  }

  private async setupServices() {
    this.messagingService.subscribe(this.publicIdentifier, async (err: Error, msg: VectorMessage) => {
      try {
        if (err) {
          throw err;
        }
        const updatedChannelState = await sync.inbound(
          msg,
          this.storeService,
          this.messagingService,
          this.signer,
          this.chainProviderUrls,
          this.protocolChannelStateEvt,
          this.protocolChannelErrorEvt,
        );
        this.channelUpdateEvt.post({
          direction: "inbound",
          updatedChannelState,
        });
      } catch (e) {
        // No need to crash the entire vector core if we receive an invalid
        // message. Just log & wait for the next one
        logger.error(`Failed to handle message`, { msg });
      }
    });

    // TODO run setup updates if the channel is not already setup

    // TODO validate that the channel is not currently in dispute/checkpoint state

    // sync latest state before starting
    // TODO: How to get channelId on startup? should we sync *all* channels?
    // const channelState = this.storeService.getChannelState(msg.data.channelId);
    // await sync.outbound(
    //   channelState.latestUpdate,
    //   this.storeService,
    //   this.messagingService,
    //   this.channelStateEvt,
    //   this.channelErrorEvt,
    // );
    return this;
  }

  /*
   * ***************************
   * *** CORE PUBLIC METHODS ***
   * ***************************
   */

  public async setup(params: SetupParams): Promise<any> {
    if (!this.chainProviders.has(params.networkContext.chainId)) {
      throw new Error(`No chain provider for chainId ${params.networkContext.chainId}`);
    }
    const channelAddress = await getCreate2MultisigAddress(
      this.publicIdentifier,
      params.counterpartyIdentifier,
      params.networkContext.channelFactoryAddress,
      ChannelFactory.abi,
      params.networkContext.vectorChannelMastercopyAddress,
      VectorChannel.abi,
      this.chainProviders.get(params.networkContext.chainId),
    );
    // TODO validate setup params for completeness
    const updateParams = {
      channelAddress,
      details: params,
      type: UpdateType.setup,
    } as UpdateParams<"setup">;

    return this.executeUpdate(updateParams);
  }

  public async deposit(params: DepositParams): Promise<FullChannelState> {
    // TODO validate deposit params for completeness
    const updateParams = {
      channelAddress: params.channelAddress,
      type: UpdateType.deposit,
      details: params,
    } as UpdateParams<"deposit">;

    return this.executeUpdate(updateParams);
  }

  public async createTransfer(params: CreateTransferParams): Promise<FullChannelState> {
    // TODO validate create params for completeness
    const updateParams = {
      channelAddress: params.channelAddress,
      type: UpdateType.create,
      details: params,
    } as UpdateParams<"create">;

    return this.executeUpdate(updateParams);
  }

  public async resolveTransfer(params: ResolveTransferParams): Promise<FullChannelState> {
    // TODO validate resolve params for completeness
    const updateParams = {
      channelAddress: params.channelAddress,
      type: UpdateType.resolve,
      details: params,
    } as UpdateParams<"resolve">;

    return this.executeUpdate(updateParams);
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
