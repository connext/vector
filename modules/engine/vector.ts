import { UpdateParams, DepositParams, UpdateType, WithdrawParams, CreateTransferParams, ResolveTransferParams } from "./types";
import * as sync from "./sync";
import {generateUpdate} from "./update";

export class Vector {
  constructor(
    private messagingService,
    private lockService,
    private storeService,
    private logService,
    private signer
  ) {
    this.messagingService = messagingService;
    this.storeService = storeService;
    this.lockService = lockService;
    this.logService = logService;
    this.signer = signer;
  }

  static connect(
    messagingService,
    lockService,
    storeService,
    signer,
    logService?
  ): Promise<Vector> {
    const node = new Vector(
      messagingService,
      lockService,
      storeService,
      logService,
      signer
    );

    // Handles up asynchronous services and checks to see that
    // channel is `setup` plus is not in dispute
    return node.setupServices();
  }

  get signerAddress() {
    return this.signer.address;
  }

  get publicIdentifier() {
    return this.signer.publicIdentifier;
  } 

  // Primary protocol execution from the leader side
  private async executeUpdate(params: UpdateParams) {
    this.logService.log(`Executing update with: ${params}`);

    const key = await this.lockService.acquireLock(params.channelId);
    const update = await generateUpdate(params, this.storeService);
    await sync.outbound(update, this.messagingService);
    await this.lockService.releaseLock(params.channelId, key);
  }

  private async setupServices() {
    this.messagingService.onReceive(this.publicIdentifier, async (msg) => {
      try {
        await sync.inbound(msg, this.storeService);
      } catch (e) {
        // No need to crash the entire cfCore if we receive an invalid message.
        // Just log & wait for the next one
        this.logService.error(`Failed to handle ${msg.type} message: ${e.message}`);
      }
    });

    // TODO run setup updates if the channel is not already setup

    // TODO validate that the channel is not currently in dispute/checkpoint state

    // sync latest state before starting
    const channelState = this.storeService.getChannelState();
    await sync.outbound(channelState.latestUpdate, this.messagingService)
    return this;
  }

   /* 
   * ***************************
   * *** CORE PUBLIC METHODS ***
   * ***************************
   */

  public async deposit(params: DepositParams) {
    // TODO validate deposit params for completeness
    const updateParams = {
      channelId: params.channelId,
      type: UpdateType.deposit,
      details: params
    } as UpdateParams

    return this.executeUpdate(updateParams)
  }

  public async withdraw(params: WithdrawParams) {
    // TODO validate withdraw params for completeness
    const updateParams = {
      channelId: params.channelId,
      type: UpdateType.withdraw,
      details: params
    } as UpdateParams

    return this.executeUpdate(updateParams)
  }

  public async createTransfer(params: CreateTransferParams) {
    // TODO validate create params for completeness
    const updateParams = {
      channelId: params.channelId,
      type: UpdateType.create,
      details: params
    } as UpdateParams

    return this.executeUpdate(updateParams)
  }

  public async resolveTransfer(params: ResolveTransferParams) {
    // TODO validate resolve params for completeness
    const updateParams = {
      channelId: params.channelId,
      type: UpdateType.resolve,
      details: params
    } as UpdateParams

    return this.executeUpdate(updateParams)
  }
}
