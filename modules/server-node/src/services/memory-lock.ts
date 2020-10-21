import crypto from "crypto";

import { Evt } from "evt";

export class MemoryLock {
  private queue: { [lockName: string]: string[] } = {};
  private evt: Evt<{ lockName: string; lockValue: string }> = new Evt();

  constructor(private readonly queueLen: number = 50, private readonly ttl: number = 30000) {}

  async acquireLock(lockName: string): Promise<string> {
    const lockValue = this.randomValue();
    const lockAcquiredPromise = this.evt
      .pipe(attrs => attrs.lockName === lockValue && attrs.lockValue === lockValue)
      .waitFor(this.ttl);
    this.addToQueue(lockName, lockValue);
    await lockAcquiredPromise;
    return lockValue;
  }

  async releaseLock(lockName: string, lockValue: string): Promise<void> {
    if (this.queue[lockName][0] !== lockValue) {
      throw new Error(`Can't release a lock that doesn't exist: ${lockName}`);
    }
    this.removeItemFromQueue(lockName, lockValue);
  }

  private addToQueue(lockName: string, lockValue: string) {
    if (!this.queue[lockName]) {
      this.queue[lockName] = [];
    }

    if (this.queue[lockName].length >= this.queueLen) {
      throw new Error(`Queue is full.`);
    }

    // add to queue
    this.queue[lockName].push(lockValue);

    setTimeout(() => {
      if (this.queue[lockName][0] === lockValue) {
        console.error(`${lockName}:${lockValue} lock timed out`);
        this.removeItemFromQueue(lockName, lockValue);
      }
    }, this.ttl);
  }

  private removeItemFromQueue(lockName: string, lockValue: string) {
    const queue = this.queue[lockName];
    const firstElement = queue[0];
    const index = queue.findIndex(value => value === lockValue);
    if (index === -1) {
      console.error(`Value not found: ${lockName}:${lockValue}`);
    }
    queue.splice(index);

    if (queue[0] !== firstElement) {
      // post next item in queue
      this.evt.post({ lockName, lockValue: queue[0] });
    }
    return;
  }

  private randomValue() {
    return crypto.randomBytes(16).toString("hex");
  }
}
