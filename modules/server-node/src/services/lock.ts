import { ILockService, IMessagingService, LockError, LockInformation, Result } from "@connext/vector-types";
import Redis from "ioredis";

import { MemoLock } from "./memo-lock";

export class LockService implements ILockService {
  private memoLock: MemoLock;

  private constructor(
    private readonly publicIdentifier: string,
    private readonly messagingService: IMessagingService,
    redisUrl: string,
  ) {
    const redis = new Redis(redisUrl);
    this.memoLock = new MemoLock(redis);
  }

  static async connect(
    publicIdentifier: string,
    messagingService: IMessagingService,
    redisUrl: string,
  ): Promise<LockService> {
    const lock = new LockService(publicIdentifier, messagingService, redisUrl);
    await lock.memoLock.setupSubs();
    await lock.setupPeerListeners();
    return lock;
  }

  private async setupPeerListeners(): Promise<void> {
    // Alice always hosts the lock service, so only alice will use
    // this callback
    return this.messagingService.onReceiveLockMessage(
      this.publicIdentifier,
      async (lockRequest: Result<LockInformation, LockError>) => {
        if (lockRequest.isError) {
          // Handle a lock failure here
          // TODO: is there anything that has to happen here?
          return;
        }
        const { type, lockName, lockValue } = lockRequest.getValue();
        if (type === "acquire") {
          await this.acquireLock(lockName, true);
        } else if (type === "release") {
          await this.releaseLock(lockName, lockValue!, true);
        }
      },
    );
  }

  public async acquireLock(lockName: string, isAlice = true, counterpartyPublicIdentifier?: string): Promise<string> {
    if (isAlice) {
      return this.memoLock.acquireLock(lockName);
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
      return this.memoLock.releaseLock(lockName, lockValue);
    } else {
      const result = await this.messagingService.sendLockMessage(
        { type: "release", lockName, lockValue },
        counterpartyPublicIdentifier!,
        this.publicIdentifier,
      );
      if (result.isError) {
        throw result.getError()!;
      }
    }
  }
}
