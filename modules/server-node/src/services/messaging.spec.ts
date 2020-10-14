import { IChannelSigner, LockInformation } from "@connext/vector-types";
import {
  createTestChannelUpdate,
  delay,
  expect,
  getRandomChannelSigner,
  NatsMessagingService,
  mkAddress,
} from "@connext/vector-utils";
import pino from "pino";

import { config } from "../config";

describe("messaging", () => {
  const logger = pino();
  let messagingA: NatsMessagingService;
  let messagingB: NatsMessagingService;
  let signerA: IChannelSigner;
  let signerB: IChannelSigner;

  beforeEach(async () => {
    signerA = getRandomChannelSigner();
    signerB = getRandomChannelSigner();
    messagingA = new NatsMessagingService(
      {
        messagingUrl: config.messagingUrl,
        signer: signerA,
        logger: logger.child({ module: "MessagingA", pubId: signerA.publicIdentifier }),
      },
    );

    messagingB = new NatsMessagingService(
      {
        messagingUrl: config.messagingUrl,
        signer: signerB,
        logger: logger.child({ module: "MessagingB", pubId: signerB.publicIdentifier }),
      },
    );

    await messagingA.connect();
    await messagingB.connect();
  });

  afterEach(async () => {
    await messagingA.disconnect();
    await messagingB.disconnect();
  });

  it("should send a protocol message from A to B", async () => {
    const update = createTestChannelUpdate("setup", {
      toIdentifier: signerB.publicIdentifier,
      fromIdentifier: signerA.publicIdentifier,
    });

    await messagingB.onReceiveProtocolMessage(signerB.publicIdentifier, async (result, from, inbox) => {
      expect(result.isError).to.not.be.ok;
      expect(result.getValue().update).to.deep.eq(update);
      expect(inbox).to.be.a("string");
      await messagingB.respondToProtocolMessage(inbox, result.getValue().update);
    });

    await delay(1_000);

    const res = await messagingA.sendProtocolMessage(update);
    expect(res.isError).to.not.be.ok;
    expect(res.getValue().update).to.deep.eq(update);
  });

  it("should send a lock message from A to B", async () => {
    const lockInformation: LockInformation = {
      type: "acquire",
      lockName: mkAddress("0xccc"),
    };

    await messagingB.onReceiveLockMessage(signerB.publicIdentifier, async (result, from, inbox) => {
      expect(result.getError()).to.be.undefined;
      expect(result.getValue()).to.be.deep.eq(lockInformation);
      expect(from).to.be.eq(signerA.publicIdentifier);
      await messagingB.respondToLockMessage(inbox, { ...lockInformation, lockValue: "release" });
    });

    await delay(1_000);

    const res = await messagingA.sendLockMessage(lockInformation, signerB.publicIdentifier, signerA.publicIdentifier);
    expect(res.getError()).to.be.undefined;
    expect(res.getValue()).to.be.a("string");
  });
});
