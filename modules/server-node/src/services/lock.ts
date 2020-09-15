import { ILockService } from "@connext/vector-types";
import Redis from "ioredis";

import { MemoLock } from "./memo-lock";

export class LockService implements ILockService {
  private memoLock: MemoLock;
  constructor(redisUrl: string) {
    const redis = new Redis(redisUrl);
    this.memoLock = new MemoLock(redis);
  }

  acquireLock(lockName: string): Promise<string> {
    return this.memoLock.acquireLock(lockName);
  }

  releaseLock(lockName: string, lockValue: string): Promise<void> {
    return this.memoLock.releaseLock(lockName, lockValue);
  }
}
