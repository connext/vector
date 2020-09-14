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
  ChannelUpdateEvent,
  EngineEventName,
  EngineEventPayloadsMap,
  IVectorEngine,
  Result,
  ChannelUpdateError,
  VectorMessage,
} from "@connext/vector-types";
import { providers } from "ethers";
import { Evt } from "evt";
import { VectorChannel, ChannelFactory } from "@connext/vector-contracts";
import Pino from "pino";

import { getCreate2MultisigAddress } from "./create2";
import * as sync from "./sync";
import { generateUpdate } from "./update";
import { logger } from "./utils";

export class Vector implements IVectorEngine {
  private protocolChannelStateEvt = Evt.create<FullChannelState>();
  private protocolChannelErrorEvt = Evt.create<ChannelUpdateError>();
  private channelUpdateEvt = Evt.create<ChannelUpdateEvent>();
  private chainProviders: Map<number, providers.JsonRpcProvider> = new Map<number, providers.JsonRpcProvider>();

  // make it private so the only way to create the class is to use `connect`
  private constructor(
    private readonly messagingService: IMessagingService,
    private readonly lockService: ILockService,
    private readonly storeService: IEngineStore,
    private readonly signer: IChannelSigner,
    private readonly chainProviderUrls: ChainProviders,
    private readonly logger: Pino.BaseLogger,
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
    logger: Pino.BaseLogger,
  ): Promise<Vector> {
    const node = new Vector(messagingService, lockService, storeService, signer, chainProviders, logger);

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
  private async executeUpdate(params: UpdateParams<any>): Promise<Result<FullChannelState, ChannelUpdateError>> {
    logger.info(`Start executeUpdate`, { params });

    const key = await this.lockService.acquireLock(params.channelAddress);
    const state = await this.storeService.getChannelState(params.channelAddress);
    if (!state) {
      throw new Error(`Channel not found ${params.channelAddress}`);
    }
    const updateRes = await generateUpdate(params, this.storeService, this.signer);
    if (updateRes.isError) {
      return Result.fail(updateRes.getError()!);
    }
    const outboundRes = await sync.outbound(
      updateRes.getValue(),
      this.storeService,
      this.messagingService,
      this.signer,
      this.chainProviderUrls,
      this.protocolChannelStateEvt,
      this.protocolChannelErrorEvt,
    );

    if (outboundRes.isError) {
      return outboundRes;
    }

    const updatedChannelState = outboundRes.getValue();
    this.channelUpdateEvt.post({
      direction: "outbound",
      updatedChannelState,
    });
    await this.lockService.releaseLock(params.channelAddress, key);
    return outboundRes;
  }

  private async setupServices(): Promise<Vector> {
    this.messagingService.subscribe(this.publicIdentifier, async (err: Error | null, msg: VectorMessage) => {
      if (err) {
        // this.logger.error(err)
      }
      const inboundRes = await sync.inbound(
        msg,
        this.storeService,
        this.messagingService,
        this.signer,
        this.chainProviderUrls,
        this.protocolChannelStateEvt,
        this.protocolChannelErrorEvt,
      );
      if (inboundRes.isError) {
        // this.logger.error(inboundRes.getError())
      }
      const updatedChannelState = inboundRes.getValue();
      this.channelUpdateEvt.post({
        direction: "inbound",
        updatedChannelState: updatedChannelState!,
      });
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

  public async setup(params: SetupParams): Promise<Result<any>> {
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
      this.chainProviders.get(params.networkContext.chainId)!,
    );
    // TODO validate setup params for completeness
    const updateParams = {
      channelAddress,
      details: params,
      type: UpdateType.setup,
    } as UpdateParams<"setup">;

    return this.executeUpdate(updateParams);
  }

  public async deposit(params: DepositParams): Promise<Result<FullChannelState>> {
    // TODO validate deposit params for completeness
    const updateParams = {
      channelAddress: params.channelAddress,
      type: UpdateType.deposit,
      details: params,
    } as UpdateParams<"deposit">;

    return this.executeUpdate(updateParams);
  }

  public async createTransfer(params: CreateTransferParams): Promise<Result<FullChannelState>> {
    // TODO validate create params for completeness
    const updateParams = {
      channelAddress: params.channelAddress,
      type: UpdateType.create,
      details: params,
    } as UpdateParams<"create">;

    return this.executeUpdate(updateParams);
  }

  public async resolveTransfer(params: ResolveTransferParams): Promise<Result<FullChannelState>> {
    // TODO validate resolve params for completeness
    const updateParams = {
      channelAddress: params.channelAddress,
      type: UpdateType.resolve,
      details: params,
    } as UpdateParams<"resolve">;

    return this.executeUpdate(updateParams);
  }

  ///////////////////////////////////
  // EVENT METHODS

  public on<T extends EngineEventName>(
    event: T,
    callback: (payload: EngineEventPayloadsMap[T]) => void | Promise<void>,
    filter?: (payload: EngineEventPayloadsMap[T]) => boolean,
  ): void {}

  public once<T extends EngineEventName>(
    event: T,
    callback: (payload: EngineEventPayloadsMap[T]) => void | Promise<void>,
    filter?: (payload: EngineEventPayloadsMap[T]) => boolean,
  ): void {}

  public waitFor<T extends EngineEventName>(
    event: T,
    timeout: number,
    filter?: (payload: EngineEventPayloadsMap[T]) => boolean,
  ): Promise<EngineEventPayloadsMap[T]> {
    return {} as any;
  }

  public async off() {}
}
