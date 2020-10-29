import { ILockService, IMessagingService, LockError, LockInformation, Result } from "@connext/vector-types";
import { MemoryLockService } from "@connext/vector-utils";
import { BaseLogger } from "pino";

export class LockService implements ILockService {
  private constructor(
    private readonly memoryLockService: MemoryLockService,
    private readonly publicIdentifier: string,
    private readonly messagingService: IMessagingService,
    private readonly log: BaseLogger,
  ) {}

  static async connect(
    publicIdentifier: string,
    messagingService: IMessagingService,
    log: BaseLogger,
    lockTTL?: number,
  ): Promise<LockService> {
    const memoryLockService = new MemoryLockService(lockTTL);
    const lock = new LockService(memoryLockService, publicIdentifier, messagingService, log);
    await lock.setupPeerListeners();
    return lock;
  }

  private async setupPeerListeners(): Promise<void> {
    // Alice always hosts the lock service, so only alice will use
    // this callback
    return this.messagingService.onReceiveLockMessage(
      this.publicIdentifier,
      async (lockRequest: Result<LockInformation, LockError>, from: string, inbox: string) => {
        if (lockRequest.isError) {
          // Handle a lock failure here
          // TODO: is there anything that has to happen here?
          this.log.error(
            {
              method: "onReceiveLockMessage",
              error: lockRequest.getError()?.message,
              context: lockRequest.getError()?.context,
            },
            "Error in lockRequest",
          );
          return;
        }
        const { type, lockName, lockValue } = lockRequest.getValue();
        if (type === "acquire") {
          try {
            const acqValue = await this.acquireLock(lockName, true);
            await this.messagingService.respondToLockMessage(inbox, { lockName, lockValue: acqValue, type });
          } catch (e) {
            this.log.error(
              {
                method: "onReceiveLockMessage",
                error: e.message,
              },
              "Error acquiring lock",
            );
            await this.messagingService.respondToLockMessage(inbox, { lockName, error: e.message, type });
          }
        } else if (type === "release") {
          try {
            await this.releaseLock(lockName, lockValue!, true);
            await this.messagingService.respondToLockMessage(inbox, { lockName, type });
          } catch (e) {
            this.log.error(
              {
                method: "onReceiveLockMessage",
                error: e.message,
              },
              "Error releasing lock",
            );
            await this.messagingService.respondToLockMessage(inbox, { lockName, error: e.message, type });
          }
        }
      },
    );
  }

  public async acquireLock(lockName: string, isAlice = true, counterpartyPublicIdentifier?: string): Promise<string> {
    if (isAlice) {
      return this.memoryLockService.acquireLock(lockName);
    } else {
      const res = await this.messagingService.sendLockMessage(
        { type: "acquire", lockName },
        counterpartyPublicIdentifier!,
        this.publicIdentifier,
      );
      if (res.isError) {
        throw res.getError()!;
      }
      const lockValue = res.getValue();
      if (!lockValue) {
        throw new LockError("Could not get lock, successfully sent lock message");
      }
      this.log.debug({ method: "acquireLock", lockName, lockValue }, "Acquired lock");
      return lockValue;
    }
  }

  public async releaseLock(
    lockName: string,
    lockValue: string,
    isAlice = true,
    counterpartyPublicIdentifier?: string,
  ): Promise<void> {
    if (isAlice) {
      return this.memoryLockService.releaseLock(lockName, lockValue);
    } else {
      const result = await this.messagingService.sendLockMessage(
        { type: "release", lockName, lockValue },
        counterpartyPublicIdentifier!,
        this.publicIdentifier,
      );
      if (result.isError) {
        throw result.getError()!;
      }
      this.log.debug({ method: "releaseLock", lockName, lockValue }, "Released lock");
    }
  }
}
