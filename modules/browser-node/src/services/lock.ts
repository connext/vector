import { ILockService, IMessagingService, Result } from "@connext/vector-types";
import { BaseLogger } from "pino";

import { BrowserNodeLockError } from "../errors";

export class BrowserLockService implements ILockService {
  constructor(
    private readonly publicIdentifier: string,
    private readonly messagingService: IMessagingService,
    private readonly log: BaseLogger,
  ) {}

  async acquireLock(lockName: string, isAlice?: boolean, counterpartyPublicIdentifier?: string): Promise<string> {
    if (!counterpartyPublicIdentifier) {
      throw new BrowserNodeLockError(BrowserNodeLockError.reasons.CounterpartyIdentifierMissing, lockName);
    }
    if (isAlice) {
      throw new BrowserNodeLockError(BrowserNodeLockError.reasons.CannotBeAlice, lockName);
    }

    const res = await this.messagingService.sendLockMessage(
      Result.ok({ type: "acquire", lockName }),
      counterpartyPublicIdentifier!,
      this.publicIdentifier,
    );
    if (res.isError) {
      throw new BrowserNodeLockError(BrowserNodeLockError.reasons.AcquireMessageFailed, lockName);
    }
    const { lockValue } = res.getValue();
    if (!lockValue) {
      throw new BrowserNodeLockError(BrowserNodeLockError.reasons.SentMessageAcquisitionFailed, lockName);
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
      throw new BrowserNodeLockError(BrowserNodeLockError.reasons.CounterpartyIdentifierMissing, lockName, lockValue);
    }
    if (isAlice) {
      throw new BrowserNodeLockError(BrowserNodeLockError.reasons.CannotBeAlice, lockName, lockValue);
    }

    const result = await this.messagingService.sendLockMessage(
      Result.ok({ type: "release", lockName, lockValue }),
      counterpartyPublicIdentifier!,
      this.publicIdentifier,
    );
    if (result.isError) {
      throw new BrowserNodeLockError(BrowserNodeLockError.reasons.ReleaseMessageFailed, lockName);
    }
    this.log.debug({ method: "releaseLock", lockName, lockValue }, "Released lock");
  }
}
