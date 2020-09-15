import {
  IVectorStore,
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
  ProtocolEventName,
  ProtocolEventPayloadsMap,
  IVectorProtocol,
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

type EvtContainer = { [K in keyof ProtocolEventPayloadsMap]: Evt<ProtocolEventPayloadsMap[K]> };

export class Vector implements IVectorProtocol {
  private evts: EvtContainer = {
    [ProtocolEventName.CHANNEL_UPDATE_EVENT]: Evt.create<ChannelUpdateEvent>(),
    [ProtocolEventName.PROTOCOL_ERROR_EVENT]: Evt.create<ChannelUpdateError>(),
    [ProtocolEventName.PROTOCOL_MESSAGE_EVENT]: Evt.create<FullChannelState>(),
  };

  private chainProviders: Map<number, providers.JsonRpcProvider> = new Map<number, providers.JsonRpcProvider>();

  // make it private so the only way to create the class is to use `connect`
  private constructor(
    private readonly messagingService: IMessagingService,
    private readonly lockService: ILockService,
    private readonly storeService: IVectorStore,
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
    storeService: IVectorStore,
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
    this.logger.info(`Start executeUpdate`, { params });

    const key = await this.lockService.acquireLock(params.channelAddress);
    const state = await this.storeService.getChannelState(params.channelAddress);
    if (!state) {
      throw new Error(`Channel not found ${params.channelAddress}`);
    }
    const updateRes = await generateUpdate(params, this.storeService, this.signer, this.logger);
    if (updateRes.isError) {
      return Result.fail(updateRes.getError()!);
    }
    const outboundRes = await sync.outbound(
      updateRes.getValue(),
      this.storeService,
      this.messagingService,
      this.signer,
      this.chainProviderUrls,
      this.evts[ProtocolEventName.PROTOCOL_MESSAGE_EVENT],
      this.evts[ProtocolEventName.PROTOCOL_ERROR_EVENT],
      this.logger,
    );

    if (outboundRes.isError) {
      return outboundRes;
    }

    const updatedChannelState = outboundRes.getValue();
    this.evts[ProtocolEventName.CHANNEL_UPDATE_EVENT].post({
      direction: "outbound",
      updatedChannelState,
    });
    await this.lockService.releaseLock(params.channelAddress, key);
    return outboundRes;
  }

  private async setupServices(): Promise<Vector> {
    this.messagingService.subscribe(this.publicIdentifier, async (msg: VectorMessage) => {
      const inboundRes = await sync.inbound(
        msg,
        this.storeService,
        this.messagingService,
        this.signer,
        this.chainProviderUrls,
        this.evts[ProtocolEventName.PROTOCOL_MESSAGE_EVENT],
        this.evts[ProtocolEventName.PROTOCOL_ERROR_EVENT],
        this.logger,
      );
      if (inboundRes.isError) {
        // this.logger.error(inboundRes.getError())
      }
      const updatedChannelState = inboundRes.getValue();
      this.evts[ProtocolEventName.CHANNEL_UPDATE_EVENT].post({
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

  public on<T extends ProtocolEventName>(
    event: T,
    callback: (payload: ProtocolEventPayloadsMap[T]) => void | Promise<void>,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    filter: (payload: ProtocolEventPayloadsMap[T]) => boolean = (_payload: ProtocolEventPayloadsMap[T]) => true,
  ): void {
    this.evts[event].pipe(filter).attach(callback);
  }

  public once<T extends ProtocolEventName>(
    event: T,
    callback: (payload: ProtocolEventPayloadsMap[T]) => void | Promise<void>,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    filter: (payload: ProtocolEventPayloadsMap[T]) => boolean = (_payload: ProtocolEventPayloadsMap[T]) => true,
  ): void {
    this.evts[event].pipe(filter).attachOnce(callback);
  }

  public waitFor<T extends ProtocolEventName>(
    event: T,
    timeout: number,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    filter: (payload: ProtocolEventPayloadsMap[T]) => boolean = (_payload: ProtocolEventPayloadsMap[T]) => true,
  ): Promise<ProtocolEventPayloadsMap[T]> {
    return this.evts[event].pipe(filter).waitFor(timeout);
  }

  public off<T extends ProtocolEventName>(
    event?: T,
  ): void {
    if (event) {
      this.evts[event].detach();
      return;
    }

    Object.keys(ProtocolEventName).forEach(k => this.evts[k].detach());
  }
}
