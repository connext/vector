import { randomBytes } from "crypto";

import { ILockService } from "@connext/vector-types";
import { Mutex, MutexInterface } from "async-mutex";

type InternalLock = {
  lock: Mutex;
  releaser: MutexInterface.Releaser;
  timer: NodeJS.Timeout;
  secret: string;
};

export class MemoryLockService implements ILockService {
  public readonly locks: Map<string, InternalLock> = new Map();

  constructor(private readonly queueLen: number = 50, private readonly ttl: number = 30000) {}

  async acquireLock(lockName: string): Promise<string> {
    let lock = this.locks.get(lockName)?.lock;
    if (!lock) {
      lock = new Mutex();
      this.locks.set(lockName, { lock, releaser: undefined, timer: undefined, secret: undefined });
    }

    const releaser = await lock.acquire();
    const secret = this.randomValue();
    const timer = setTimeout(() => this.releaseLock(lockName, secret), this.ttl);
    this.locks.set(lockName, { lock, releaser, timer, secret });
    return secret;
  }

  async releaseLock(lockName: string, lockValue: string): Promise<void> {
    const lock = this.locks.get(lockName);

    if (!lock) {
      throw new Error(`Can't release a lock that doesn't exist: ${lockName}`);
    }
    if (lockValue !== lock.secret) {
      throw new Error("Incorrect lock value");
    }

    clearTimeout(lock!.timer);
    return lock!.releaser();
  }

  private randomValue() {
    return randomBytes(16).toString("hex");
  }
}
