import { UpdateParams } from "./types";
import * as sync from "./sync";
import update from "./update";

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

  static create(
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
    return node.setupServices();
  }

  get signerAddress() {
    return this.signer.address;
  }

  get publicIdentifier() {
    return this.signer.publicIdentifier;
  }

  private async executeUpdate(params: UpdateParams) {
    this.logService.log(`Executing update with: ${params}`);

    const key = await this.lockService.acquireLock(params.channelId);
    const update = await update(params);
    await sync.outbound(update, this.messagingService);
    await this.lockService.releaseLock(params.channelId, key);
  }

  private async setupServices() {
    this.messagingService.onReceive(this.publicIdentifier, async (msg) => {
      try {
        await sync.inbound(msg);
      } catch (e) {
        // No need to crash the entire cfCore if we receive an invalid message.
        // Just log & wait for the next one
        this.logService.error(`Failed to handle ${msg.type} message: ${e.message}`);
      }
    });
    return this;
  }
}
