import { getRandomChannelSigner, getTestLoggers, NatsMessagingService, expect, delay } from "@connext/vector-utils";
import pino from "pino";
import { IChannelSigner, Result } from "@connext/vector-types";

import { NatsRouterMessagingService } from "../../services/messaging";
import { getConfig } from "../../config";

const config = getConfig();

describe("messaging.ts", () => {
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

  it("should properly respond with config when requested", async () => {
    const configResponse = { allowedSwaps: config.allowedSwaps, supportedChains: [1, 2, 3] };

    await routerMessaging.onReceiveRouterConfigMessage(
      router.publicIdentifier,
      async (result: Result<any, any>, from: string, inbox: string) => {
        expect(result.isError).to.not.be.ok;
        expect(result.getValue()).to.not.be.ok;
        expect(inbox).to.be.a("string");
        expect(from).to.be.eq(signer.publicIdentifier);
        await routerMessaging.respondToRouterConfigMessage(inbox, Result.ok(configResponse));
      },
    );

    await delay(1_000);

    const res = await messaging.sendRouterConfigMessage(
      Result.ok(undefined),
      router.publicIdentifier,
      signer.publicIdentifier,
    );
    expect(res.isError).to.be.false;
    expect(res.getValue()).to.be.deep.eq(configResponse);
  });
});
