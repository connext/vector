import { MemoryLockService, LOCK_TTL } from "./lock";

import { delay, expect } from "./";

describe("MemoLock", () => {
  describe("with a common lock", () => {
    let module: MemoryLockService;

    beforeEach(async () => {
      module = new MemoryLockService();
    });

    it("should not allow locks to simultaneously access resources", async function () {
      this.timeout(60_000);
      const store = { test: "value" };
      const callback = async (lockName: string, wait: number = LOCK_TTL / 2) => {
        await delay(wait);
        store.test = lockName;
      };
      const lock = await module.acquireLock("foo");
      callback("round1").then(async () => {
        await module.releaseLock("foo", lock);
      });
      const nextLock = await module.acquireLock("foo");
      expect(nextLock).to.not.eq(lock);
      await callback("round2", LOCK_TTL / 4);
      await module.releaseLock("foo", nextLock);
      expect(store.test).to.be.eq("round2");
    }).timeout();

    it("should allow locking to occur", async function () {
      const lock = await module.acquireLock("foo");
      const start = Date.now();
      setTimeout(() => {
        module.releaseLock("foo", lock);
      }, 101);
      const nextLock = await module.acquireLock("foo");
      expect(Date.now() - start).to.be.at.least(100);
      await module.releaseLock("foo", nextLock);
    });

    it("should handle deadlocks", async function () {
      this.timeout(60_000);
      await module.acquireLock("foo");
      await delay(800);
      const lock = await module.acquireLock("foo");
      await module.releaseLock("foo", lock);
    });

    it("should handle concurrent locking", async function () {
      this.timeout(60_000);
      const start = Date.now();
      const array = [1, 2, 3, 4];
      await Promise.all(
        array.map(async (i) => {
          // TODO: THIS IS NOT ACTUALLY CONCURRENT
          // await delay(i);
          const lock = await module.acquireLock("foo");
          await delay(800);
          await module.releaseLock("foo", lock);
          expect(Date.now() - start).to.be.gte(700 * i);
        }),
      );
    });
  });
});
