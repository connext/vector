import { ILockService, IMessagingService, LockError } from "@connext/vector-types";
import { BaseLogger } from "pino";

export class BrowserLockService implements ILockService {
  constructor(
    private readonly publicIdentifier: string,
    private readonly messagingService: IMessagingService,
    private readonly log: BaseLogger,
  ) {}

  async acquireLock(lockName: string, isAlice?: boolean, counterpartyPublicIdentifier?: string): Promise<string> {
    if (!counterpartyPublicIdentifier) {
      throw new LockError(`counterpartyPublicIdentifier is required`);
    }
    if (isAlice) {
      throw new LockError(`Browser node cannot be Alice`);
    }

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

  async releaseLock(
    lockName: string,
    lockValue: string,
    isAlice?: boolean,
    counterpartyPublicIdentifier?: string,
  ): Promise<void> {
    if (!counterpartyPublicIdentifier) {
      throw new LockError(`counterpartyPublicIdentifier is required`);
    }
    if (isAlice) {
      throw new LockError(`Browser node cannot be Alice`);
    }

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
