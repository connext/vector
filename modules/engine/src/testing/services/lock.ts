import { ILockService } from "@connext/types";
import { Mutex, MutexInterface } from "async-mutex";

const IO_SEND_AND_WAIT_TIMEOUT = 10_000;

type InternalLock = {
  lock: Mutex;
  releaser: MutexInterface.Releaser;
  timer: NodeJS.Timeout;
};

export class MemoryLockService implements ILockService {
  public readonly locks: Map<string, InternalLock> = new Map();

  async acquireLock(lockName: string): Promise<any> {
    let lock: Mutex;
    if (!this.locks.has(lockName)) {
      lock = new Mutex();
    } else {
      lock = this.locks.get(lockName)!.lock;
    }
    const releaser = await lock.acquire();
    const timer = setTimeout(() => this.releaseLock(lockName), IO_SEND_AND_WAIT_TIMEOUT + 1_000);
    this.locks.set(lockName, { lock, releaser, timer });
  }

  async releaseLock(lockName: string, lockValue?: string): Promise<void> {
    const lock = this.locks.get(lockName);
    clearTimeout(lock!.timer);
    return lock!.releaser();
  }
}
