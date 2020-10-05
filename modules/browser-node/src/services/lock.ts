import { ILockService } from "@connext/vector-types";

export class BrowserLockService implements ILockService {
  acquireLock(lockName: string): Promise<string> {
    throw new Error("Method not implemented.");
  }
  releaseLock(lockName: string, lockValue: string): Promise<void> {
    throw new Error("Method not implemented.");
  }
}
