import { MemoryLockService } from "./lock";

import { delay, expect } from "./";

describe("MemoLock", () => {
  describe("with a common lock", () => {
    let module: MemoryLockService;
    const TTL = 5000;

    beforeEach(async () => {
      module = new MemoryLockService(5, TTL);
    });

    it("should not allow locks to simultaneously access resources", async function() {
      this.timeout(60_000);
      const store = { test: "value" };
      const callback = async (lockName: string, wait: number = TTL / 2) => {
        await delay(wait);
        store.test = lockName;
      };
      const lock = await module.acquireLock("foo");
      callback("round1").then(async () => {
        await module.releaseLock("foo", lock);
      });
      const nextLock = await module.acquireLock("foo");
      expect(nextLock).to.not.eq(lock);
      await callback("round2", TTL / 4);
      await module.releaseLock("foo", nextLock);
      expect(store.test).to.be.eq("round2");
    }).timeout();

    it("should allow locking to occur", async function() {
      const lock = await module.acquireLock("foo");
      const start = Date.now();
      setTimeout(() => {
        module.releaseLock("foo", lock);
      }, 101);
      const nextLock = await module.acquireLock("foo");
      expect(Date.now() - start).to.be.at.least(100);
      await module.releaseLock("foo", nextLock);
    });

    it.skip("should enforce the queue size", async function() {
      await module.acquireLock("foo");
      for (let i = 0; i < 4; i++) {
        module.acquireLock("foo").catch(console.error.bind(console, "Error acquiring lock:"));
      }
      await new Promise(resolve => setTimeout(resolve, 100));
      try {
        await module.acquireLock("foo");
      } catch (e) {
        expect(e.message).to.contain("is full");
        return;
      }
      throw new Error("expected an error");
    });

    it("should handle deadlocks", async function() {
      this.timeout(60_000);
      await module.acquireLock("foo");
      await delay(800);
      const lock = await module.acquireLock("foo");
      await module.releaseLock("foo", lock);
    });

    it.only("should handle concurrent locking", async function() {
      this.timeout(60_000);
      const start = Date.now();
      const array = [1, 2, 3, 4];
      await Promise.all(
        array.map(async i => {
          // TODO: THIS IS NOT ACTUALLY CONCURRENT
          await delay(i);
          const lock = await module.acquireLock("foo");
          await delay(800);
          await module.releaseLock("foo", lock);
          expect(Date.now() - start).to.be.gte(700 * i);
        }),
      );
    });
  });

  it.skip("should expire locks in TTL order", async function() {
    const customModule = new MemoryLockService(5, 1000);

    await customModule.acquireLock("foo");
    let err: Error;
    let done = false;
    customModule
      .acquireLock("foo")
      .then(() => console.error(`Lock was unlocked - should not happen!`))
      .catch(e => {
        err = e;
      });
    setTimeout(
      () =>
        customModule
          .acquireLock("foo")
          .then(() => {
            done = true;
          })
          .catch(e => console.error(`Caught error acquiring lock: ${e.stack}`)),
      500,
    );
    await new Promise((resolve, reject) =>
      setTimeout(() => {
        try {
          expect(err).not.to.be.undefined;
          expect(err!.message).to.contain("expired after");
          expect(done).to.be.true;
          resolve();
        } catch (e) {
          reject(e);
        }
      }, 2000),
    );
  });
});
