import { Evt } from "evt";

import * as sync from "./sync";
import {
  ChannelState,
  CreateTransferParams,
  DepositParams,
  ILockService,
  IMessagingService,
  IStoreService,
  ResolveTransferParams,
  UpdateParams,
  UpdateType,
  VectorMessage,
} from "./types";
import { generateUpdate } from "./update";
import { InboundChannelError, logger } from "./utils";

export class Vector {
  private channelStateEvt = Evt.create<ChannelState>();
  private channelErrorEvt = Evt.create<InboundChannelError>();

  constructor(
    // eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
    private messagingService: any,
    // eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
    private lockService: any,
    // eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
    private storeService: any,
    // eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
    private signer: any,
  ) {
    this.messagingService = messagingService;
    this.storeService = storeService;
    this.lockService = lockService;
    this.signer = signer;
  }

  static connect(
    messagingService: IMessagingService,
    lockService: ILockService,
    storeService: IStoreService,
    // eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
    signer: any,
  ): Promise<Vector> {
    const node = new Vector(
      messagingService,
      lockService,
      storeService,
      signer,
    );

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
  private async executeUpdate(params: UpdateParams) {
    logger.info(`Start executeUpdate`, {params});

    const key = await this.lockService.acquireLock(params.channelId);
    const update = await generateUpdate(params, this.storeService);
    await sync.outbound(update, this.storeService, this.messagingService, this.channelStateEvt, this.channelErrorEvt);
    await this.lockService.releaseLock(params.channelId, key);
  }

  private async setupServices() {
    this.messagingService.onReceive(this.publicIdentifier, async (msg: VectorMessage) => {
      try {
        await sync.inbound(msg, this.storeService, this.messagingService, this.signer, this.channelStateEvt, this.channelErrorEvt);
      } catch (e) {
        // No need to crash the entire vector core if we receive an invalid
        // message. Just log & wait for the next one
        logger.error(`Failed to handle message`, { msg });
      }
    });

    // TODO run setup updates if the channel is not already setup

    // TODO validate that the channel is not currently in dispute/checkpoint state

    // sync latest state before starting
    const channelState = this.storeService.getChannelState();
    await sync.outbound(channelState.latestUpdate, this.storeService, this.messagingService, this.channelStateEvt, this.channelErrorEvt);
    return this;
  }

   /* 
   * ***************************
   * *** CORE PUBLIC METHODS ***
   * ***************************
   */

  public async deposit(params: DepositParams): Promise<any> {
    // TODO validate deposit params for completeness
    const updateParams = {
      channelId: params.channelId,
      type: UpdateType.deposit,
      details: params,
    } as UpdateParams;

    return this.executeUpdate(updateParams);
  }

  public async createTransfer(params: CreateTransferParams): Promise<any> {
    // TODO validate create params for completeness
    const updateParams = {
      channelId: params.channelId,
      type: UpdateType.create,
      details: params,
    } as UpdateParams;

    return this.executeUpdate(updateParams);
  }

  public async resolveTransfer(params: ResolveTransferParams): Promise<any> {
    // TODO validate resolve params for completeness
    const updateParams = {
      channelId: params.channelId,
      type: UpdateType.resolve,
      details: params,
    } as UpdateParams;

    return this.executeUpdate(updateParams);
  }
}
