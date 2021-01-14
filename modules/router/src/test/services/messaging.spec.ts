import { getRandomChannelSigner, getTestLoggers, NatsMessagingService, expect, delay } from "@connext/vector-utils";
import pino from "pino";
import { IChannelSigner } from "@connext/vector-types";

import { NatsRouterMessagingService } from "../../services/messaging";
import { config } from "../../config";

describe.only("messaging.ts", () => {
  const { log: logger } = getTestLoggers("messaging", "trace" as pino.Level);
  let routerMessaging: NatsRouterMessagingService;
  let messaging: NatsMessagingService;
  let router: IChannelSigner;
  let signer: IChannelSigner;

  beforeEach(async () => {
    signer = getRandomChannelSigner();
    router = getRandomChannelSigner();
    routerMessaging = new NatsRouterMessagingService({
      messagingUrl: config.messagingUrl,
      signer: router,
      logger: logger.child({ module: "RouterMessaging" }),
    });

    messaging = new NatsMessagingService({
      messagingUrl: config.messagingUrl,
      signer,
      logger: logger.child({ module: "NatsMessaging" }),
    });

    await routerMessaging.connect();
    await messaging.connect();
  });

  it("should publish + subscribe to config", async () => {
    const promise = new Promise(async (resolve, reject) => {
      setTimeout(() => reject("No config received"), 15_000);
      await messaging.subscribeToRouterConfigMessage(router.publicIdentifier, (config: any) => resolve(config));
    });

    const response = { allowedSwaps: config.allowedSwaps, supportedChains: [1, 2, 3] };

    // NOTE: watch logs in debug, if the delay isnt added then the subscription
    // is created AFTER the message is published
    await delay(5_000);

    await routerMessaging.publishRouterConfig(response);
    console.log("published, waiting for promise");
    const received = await promise;
    expect(received).to.be.deep.eq(response);
  });
});
