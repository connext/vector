import { IChannelSigner } from "@connext/vector-types";
import { createTestChannelUpdate, delay, getRandomChannelSigner } from "@connext/vector-utils";
import pino from "pino";

import { expect } from "../test/utils/assert";
import { config } from "../config";

import { getBearerTokenFunction, NatsMessagingService } from "./messaging";

describe("messaging", () => {
  const logger = pino();
  let messagingA: NatsMessagingService;
  let messagingB: NatsMessagingService;
  let signerA: IChannelSigner;
  let signerB: IChannelSigner;

  beforeEach(async () => {
    signerA = getRandomChannelSigner();
    console.log("signerA: ", signerA.publicIdentifier);
    signerB = getRandomChannelSigner();
    console.log("signerB: ", signerB.publicIdentifier);
    console.log("config.natsUrl: ", config.natsUrl);
    messagingA = new NatsMessagingService(
      {
        messagingUrl: config.natsUrl,
      },
      logger.child({ module: "MessagingA", pubId: signerA.publicIdentifier }),
      getBearerTokenFunction(signerA),
    );

    messagingB = new NatsMessagingService(
      {
        messagingUrl: config.natsUrl,
      },
      logger.child({ module: "MessagingB", pubId: signerB.publicIdentifier }),
      getBearerTokenFunction(signerB),
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
});
