import { Balance, IChannelSigner, IMessagingService } from "@connext/vector-types";
import {
  createCoreTransferState,
  createTestChannelState,
  createTestChannelUpdate,
  getRandomChannelSigner,
} from "@connext/vector-utils";
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
    signerB = getRandomChannelSigner();
    console.log("config.natsUrl: ", config.natsUrl);
    messagingA = new NatsMessagingService(
      {
        messagingUrl: config.natsUrl,
      },
      logger.child({ module: "MessagingA", pubId: signerA.publicIdentifier }),
      getBearerTokenFunction(signerA),
      signerA.publicIdentifier,
    );

    messagingB = new NatsMessagingService(
      {
        messagingUrl: config.natsUrl,
      },
      logger.child({ module: "MessagingB", pubId: signerB.publicIdentifier }),
      getBearerTokenFunction(signerB),
      signerB.publicIdentifier,
    );

    await messagingA.connect();
    await messagingB.connect();
  });

  afterEach(async () => {
    await messagingA.disconnect();
    await messagingB.disconnect();
  });

  it.only("should send a protocol message from A to B", async () => {
    return new Promise(async (resolve) => {
      const update = createTestChannelUpdate("setup", {
        toIdentifier: signerB.publicIdentifier,
        fromIdentifier: signerA.publicIdentifier,
      });

      await messagingB.onReceiveProtocolMessage(signerB.publicIdentifier, (result) => {
        expect(result.isError).to.not.be.ok;
        expect(result.getValue()).to.deep.eq(update);
        resolve();
      });

      await messagingA.sendProtocolMessage(update);
    });
  });
});
