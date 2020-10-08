import { ILockService, IMessagingService } from "@connext/vector-types";
import { NatsMessagingService, getBearerTokenFunction, ChannelSigner } from "@connext/vector-utils";
import Redis from "ioredis";

import { MemoLock } from "./memo-lock";
import { config } from "../config";
import { HDNode } from "ethers/lib/utils";

export class LockService implements ILockService {
  private memoLock: MemoLock;
  private messaging: IMessagingService;
  private myPublicIdentifier: string;

  private constructor(redisUrl: string, myPublicIdentifier: string) {
    this.myPublicIdentifier = myPublicIdentifier;
    const redis = new Redis(redisUrl);
    this.memoLock = new MemoLock(redis);
    const signer = new ChannelSigner(HDNode.fromMnemonic(config.mnemonic).privateKey);
    this.messaging = new NatsMessagingService(
      {
        messagingUrl: config.natsUrl,
      },
      getBearerTokenFunction(signer, config.authUrl),
    );
  }

  static async connect(redisUrl: string, myPublicIdentifier: string): Promise<LockService> {
    const lock = new LockService(redisUrl, myPublicIdentifier);
    await lock.memoLock.setupSubs();
    await lock.setupPeerListeners();
    return lock;
  }

  private async setupPeerListeners(): Promise<void> {
    return this.messaging.onReceiveLockMessage(this.myPublicIdentifier, async (msg: any) => {
      if (msg.type === "acquire") {
        await this.acquireLock(msg.lockName, true);
      } else if (msg.type === "release") {
        await this.releaseLock(msg.lockName, msg.lockValue, true);
      } else {
        // Dont do anything here (ignore spam)
      }
    });
  }

  acquireLock(lockName: string, isAlice: boolean = true, counterpartyPublicIdentifier?: string): Promise<string> {
    if (isAlice) {
      return this.memoLock.acquireLock(lockName);
    } else {
      const res = await this.messaging.sendLockMessage(
        "acquire",
        {
          myPublicIdentifier: this.myPublicIdentifier,
          counterpartyPublicIdentifier,
        },
        lockName,
      );
      return res.getValue(); // TODO handle this correctly
    }
  }

  releaseLock(
    lockName: string,
    lockValue: string,
    isAlice: boolean = true,
    counterpartyPublicIdentifier?: string,
  ): Promise<void> {
    if (isAlice) {
      return this.memoLock.releaseLock(lockName, lockValue);
    } else {
      return this.messaging.sendLockMessage(
        "release",
        {
          myPublicIdentifier: this.myPublicIdentifier,
          counterpartyPublicIdentifier,
        },
        lockName,
        lockValue,
      );
    }
  }
}
