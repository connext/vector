import { IChannelSigner, Result, LockError, MessagingError, UpdateType } from "@connext/vector-types";
import {
  createTestChannelUpdate,
  delay,
  expect,
  getRandomChannelSigner,
  NatsMessagingService,
  mkAddress,
  createTestChannelState,
  getTestLoggers,
} from "@connext/vector-utils";
import pino from "pino";

import { config } from "../config";

describe("messaging", () => {
  console.log("config.logLevel: ", config.logLevel);
  const { log: logger } = getTestLoggers("messaging", (config.logLevel ?? "fatal") as pino.Level);
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

    await messagingB.onReceiveProtocolMessage(
      signerB.publicIdentifier,
      async (result: Result<any, any>, from: string, inbox: string) => {
        expect(result.isError).to.not.be.ok;
        expect(result.getValue()).to.containSubset({ update });
        expect(inbox).to.be.a("string");
        await messagingB.respondToProtocolMessage(inbox, update);
      },
    );

    await delay(1_000);

    const res = await messagingA.sendProtocolMessage(update);
    expect(res.isError).to.not.be.ok;
    expect(res.getValue()).to.containSubset({ update });
  });

  it("should send a protocol error message from A to B", async () => {
    const update = createTestChannelUpdate("setup", {
      toIdentifier: signerB.publicIdentifier,
      fromIdentifier: signerA.publicIdentifier,
    });

    const err = new Error("failure");

    await messagingB.onReceiveProtocolMessage(
      signerB.publicIdentifier,
      async (result: Result<any, any>, from: string, inbox: string) => {
        expect(result.isError).to.not.be.ok;
        expect(result.getValue()).to.containSubset({ update });
        expect(inbox).to.be.a("string");
        await messagingB.respondWithProtocolError(inbox, err as any);
      },
    );

    await delay(1_000);

    const res = await messagingA.sendProtocolMessage(update);
    expect(res.isError).to.be.true;
    const errReceived = res.getError()!;
    Object.keys(errReceived).map((key: string) => {
      const val = (errReceived as any)[key] ?? undefined;
      expect(val).to.be.deep.eq((err as any)[key]);
    });
  });

  describe("other methods", () => {
    const tests = [
      {
        name: "setup should work from A --> B",
        message: Result.ok({ chainId: 4, timeout: "57" }),
        response: Result.ok({ channelAddress: mkAddress("0xc") }),
        type: "Setup",
      },
      {
        name: "setup send failure messages properly from A --> B",
        message: Result.fail(new Error("sender failure")),
        response: Result.fail(new Error("responder failure")),
        type: "Setup",
      },
      {
        name: "lock should work from A --> B",
        message: Result.ok({
          type: "acquire",
          lockName: mkAddress("0xccc"),
        }),
        response: Result.ok({
          type: "acquire",
          lockName: mkAddress("0xccc"),
        }),
        type: "Lock",
      },
      {
        name: "lock send failure messages properly from A --> B",
        message: Result.fail(new LockError("sender failure", mkAddress("0xccc"), { type: "release" })),
        response: Result.fail(new LockError("responder failure", mkAddress("0xccc"), { type: "acquire" })),
        type: "Lock",
      },
      {
        name: "requestCollateral should work from A --> B",
        message: Result.ok({
          amount: "100",
          channelAddress: mkAddress("0xccc"),
          assetId: mkAddress("0xaaa"),
        }),
        response: Result.ok({ message: "success" }),
        type: "RequestCollateral",
      },
      {
        name: "requestCollateral send failure messages properly from A --> B",
        message: Result.fail(new MessagingError("sender failure" as any, { test: "context" })),
        response: Result.fail(new Error("responder failure")),
        type: "RequestCollateral",
      },
      {
        name: "requestCollateral should work from A --> B",
        message: Result.ok({
          amount: "100",
          channelAddress: mkAddress("0xccc"),
          assetId: mkAddress("0xaaa"),
        }),
        response: Result.ok({ message: "success" }),
        type: "RequestCollateral",
      },
      {
        name: "requestCollateral send failure messages properly from A --> B",
        message: Result.fail(new MessagingError("sender failure" as any, { test: "context" })),
        response: Result.fail(new Error("responder failure")),
        type: "RequestCollateral",
      },
      {
        name: "restoreState should work from A --> B",
        message: Result.ok({
          chainId: 1337,
        }),
        response: Result.ok({ channel: createTestChannelState(UpdateType.setup).channel, activeTransfers: [] }),
        type: "RestoreState",
      },
      {
        name: "restoreState send failure messages properly from A --> B",
        message: Result.fail(new MessagingError("sender failure" as any, { test: "context" })),
        response: Result.fail(new Error("responder failure")),
        type: "RestoreState",
      },
    ];

    for (const { name, message, response, type } of tests) {
      it(name, async () => {
        const callbackKey = `onReceive${type}Message`;
        const sendKey = `send${type}Message`;
        const respondKey = `respondTo${type}Message`;
        await (messagingB as any)[callbackKey](
          signerB.publicIdentifier,
          async (result: Result<any, any>, from: string, inbox: string) => {
            expect(from).to.be.eq(signerA.publicIdentifier);
            expect(inbox).to.be.a("string");
            expect(result.isError).to.be.eq(message.isError);
            if (!message.isError) {
              expect(result.getError()).to.be.undefined;
              expect(result.getValue()).to.be.deep.eq(message.getValue());
            } else {
              const errReceived = result.getError()!;
              Object.keys(errReceived).map((key: string) => {
                const val = (errReceived as any)[key] ?? undefined;
                expect(val).to.be.deep.eq((message.getError() as any)[key]);
              });
            }
            await (messagingB as any)[respondKey](inbox, response as any);
          },
        );

        await delay(1_000);

        // Send messages + verify
        const test = await (messagingA as any)[sendKey](
          message as any,
          signerB.publicIdentifier,
          signerA.publicIdentifier,
        );
        expect(test.isError).to.be.deep.eq(response.isError);
        if (!test.isError) {
          expect(test.getError()).to.be.undefined;
          expect(test.getValue()).to.be.deep.eq(response.getValue());
        } else {
          const errReceived = test.getError()!;
          Object.keys(errReceived).map((key: string) => {
            const val = (errReceived as any)[key] ?? undefined;
            expect(val).to.be.deep.eq((response.getError() as any)[key]);
          });
        }
      });
    }
  });
});
