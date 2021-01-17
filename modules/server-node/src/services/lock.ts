import {
  ILockService,
  IMessagingService,
  LockInformation,
  NodeError,
  Result,
  jsonifyError,
} from "@connext/vector-types";
import { MemoryLockService } from "@connext/vector-utils";
import { BaseLogger } from "pino";

import { ServerNodeLockError } from "../helpers/errors";

export class LockService implements ILockService {
  private constructor(
    private readonly memoryLockService: MemoryLockService,
    private readonly publicIdentifier: string,
    private readonly messagingService: IMessagingService,
    private readonly log: BaseLogger,
  ) {}

  static async connect(
    publicIdentifier: string,
    messagingService: IMessagingService,
    log: BaseLogger,
    lockTTL?: number,
  ): Promise<LockService> {
    const memoryLockService = new MemoryLockService(lockTTL);
    const lock = new LockService(memoryLockService, publicIdentifier, messagingService, log);
    await lock.setupPeerListeners();
    return lock;
  }

  private async setupPeerListeners(): Promise<void> {
    // Alice always hosts the lock service, so only alice will use
    // this callback
    return this.messagingService.onReceiveLockMessage(
      this.publicIdentifier,
      async (lockRequest: Result<LockInformation, NodeError>, from: string, inbox: string) => {
        if (lockRequest.isError) {
          // Handle a lock failure here
          // TODO: is there anything that has to happen here?
          this.log.error(
            {
              method: "onReceiveLockMessage",
              error: lockRequest.getError()?.message,
              context: lockRequest.getError()?.context,
            },
            "Error in lockRequest",
          );
          return;
        }
        const { type, lockName, lockValue } = lockRequest.getValue();
        if (type === "acquire") {
          let acqValue;
          let method = "acquireLock";
          try {
            acqValue = await this.acquireLock(lockName, true);
            method = "respondToLockMessage";
            await this.messagingService.respondToLockMessage(inbox, Result.ok({ lockName, lockValue: acqValue, type }));
          } catch (e) {
            this.log.error(
              {
                method: "onReceiveLockMessage",
                error: e.message,
              },
              "Error acquiring lock",
            );
            await this.messagingService.respondToLockMessage(
              inbox,
              Result.fail(
                new ServerNodeLockError(ServerNodeLockError.reasons.AcquireLockFailed, lockName, lockValue, {
                  acqValue,
                  failingMethod: method,
                  lockError: e.message,
                }),
              ),
            );
          }
        } else if (type === "release") {
          let method = "releaseLock";
          try {
            await this.releaseLock(lockName, lockValue!, true);
            method = "respondToLockMessage";
            await this.messagingService.respondToLockMessage(inbox, Result.ok({ lockName, type }));
          } catch (e) {
            this.log.error(
              {
                method: "onReceiveLockMessage",
                error: e.message,
              },
              "Error releasing lock",
            );
            await this.messagingService.respondToLockMessage(
              inbox,
              Result.fail(
                new ServerNodeLockError(ServerNodeLockError.reasons.FailedToReleaseLock, lockName, lockValue, {
                  failingMethod: method,
                  releaseError: e.message,
                  ...(e.context ?? {}),
                }),
              ),
            );
          }
        }
      },
    );
  }

  public async acquireLock(lockName: string, isAlice = true, counterpartyPublicIdentifier?: string): Promise<string> {
    if (isAlice) {
      return this.memoryLockService.acquireLock(lockName);
    } else {
      const res = await this.messagingService.sendLockMessage(
        Result.ok({ type: "acquire", lockName }),
        counterpartyPublicIdentifier!,
        this.publicIdentifier,
      );
      if (res.isError) {
        throw new ServerNodeLockError(ServerNodeLockError.reasons.AcquireMessageFailed, lockName, undefined, {
          counterpartyPublicIdentifier,
          isAlice,
          messagingError: jsonifyError(res.getError()!),
        });
      }
      const { lockValue } = res.getValue();
      if (!lockValue) {
        throw new ServerNodeLockError(ServerNodeLockError.reasons.SentMessageAcquisitionFailed, lockName, lockValue, {
          counterpartyPublicIdentifier,
          isAlice,
        });
      }
      this.log.debug({ method: "acquireLock", lockName, lockValue }, "Acquired lock");
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
      return this.memoryLockService.releaseLock(lockName, lockValue);
    } else {
      const result = await this.messagingService.sendLockMessage(
        Result.ok({ type: "release", lockName, lockValue }),
        counterpartyPublicIdentifier!,
        this.publicIdentifier,
      );
      if (result.isError) {
        throw new ServerNodeLockError(ServerNodeLockError.reasons.ReleaseMessageFailed, lockName, lockValue, {
          messagingError: jsonifyError(result.getError()!),
          counterpartyPublicIdentifier,
          isAlice,
        });
      }
      this.log.debug({ method: "releaseLock", lockName, lockValue }, "Released lock");
    }
  }
}
