import { IChannelSigner, LockInformation, Result } from "@connext/vector-types";
import {
  createTestChannelUpdate,
  delay,
  expect,
  getRandomChannelSigner,
  NatsMessagingService,
  mkAddress,
  safeJsonStringify,
} from "@connext/vector-utils";
import pino from "pino";

import { config } from "../config";

describe.only("messaging", () => {
  const logger = pino();
  let messagingA: NatsMessagingService;
  let messagingB: NatsMessagingService;
  let signerA: IChannelSigner;
  let signerB: IChannelSigner;

  beforeEach(async () => {
    signerA = getRandomChannelSigner();
    signerB = getRandomChannelSigner();
    messagingA = new NatsMessagingService({
      messagingUrl: config.messagingUrl,
      signer: signerA,
      logger: logger.child({ module: "MessagingA", pubId: signerA.publicIdentifier }),
    });

    messagingB = new NatsMessagingService({
      messagingUrl: config.messagingUrl,
      signer: signerB,
      logger: logger.child({ module: "MessagingB", pubId: signerB.publicIdentifier }),
    });

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

  it("should send a protocol error from A to B", async () => {});

  describe("setup", () => {
    const tests = [
      {
        name: "setup should work from A --> B",
        message: Result.ok({ chainId: 4, timeout: "57" }),
        response: Result.ok({ channelAddress: mkAddress("0xc") }),
      },
      {
        name: "setup send failure messages properly from A --> B",
        message: Result.fail(new Error("sender failure")),
        response: Result.fail(new Error("responder failure")),
      },
    ];

    for (const { name, message, response } of tests) {
      it(name, async () => {
        await messagingB.onReceiveSetupMessage(signerB.publicIdentifier, async (result, from, inbox) => {
          expect(from).to.be.eq(signerA.publicIdentifier);
          expect(inbox).to.be.a("string");
          expect(result.isError).to.be.eq(message.isError);
          if (!message.isError) {
            expect(result.getError()).to.be.undefined;
            expect(result.getValue()).to.be.deep.eq(message.getValue());
          } else {
            expect(result.getError()?.toString()).to.be.eq(message.getError()?.toString());
          }
          await messagingB.respondToSetupMessage(inbox, response as any);
        });

        await delay(1_000);

        // Send messages + verify
        const test = await messagingA.sendSetupMessage(
          message as any,
          signerB.publicIdentifier,
          signerA.publicIdentifier,
        );
        expect(test.isError).to.be.deep.eq(response.isError);
        if (!test.isError) {
          expect(test.getError()).to.be.undefined;
          expect(test.getValue()).to.be.deep.eq(response.getValue());
        } else {
          expect(test.getError()?.context.error).to.be.eq("Error: " + response.getError()!.message);
        }
      });
    }
  });

  it("should send a request collateral from A to B", async () => {});

  it("should send a lock message from A to B", async () => {
    const lockInformation: LockInformation = {
      type: "acquire",
      lockName: mkAddress("0xccc"),
    };

    await messagingB.onReceiveLockMessage(signerB.publicIdentifier, async (result, from, inbox) => {
      expect(result.getError()).to.be.undefined;
      expect(result.getValue()).to.be.deep.eq(lockInformation);
      expect(from).to.be.eq(signerA.publicIdentifier);
      await messagingB.respondToLockMessage(inbox, Result.ok({ ...lockInformation, lockValue: "release" }));
    });

    await delay(1_000);

    const res = await messagingA.sendLockMessage(
      Result.ok(lockInformation),
      signerB.publicIdentifier,
      signerA.publicIdentifier,
    );
    expect(res.getError()).to.be.undefined;
    expect(res.getValue()).to.be.a("string");
  });
});
