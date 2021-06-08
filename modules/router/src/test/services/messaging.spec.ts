import {
  getRandomChannelSigner,
  getTestLoggers,
  NatsMessagingService,
  expect,
  delay,
  mkPublicIdentifier,
  mkAddress,
  mkSig,
} from "@connext/vector-utils";
import pino from "pino";
import { IChannelSigner, NodeResponses, Result } from "@connext/vector-types";

import { NatsRouterMessagingService } from "../../services/messaging";
import { getConfig } from "../../config";

const config = getConfig();

describe("messaging.ts", () => {
  const { log: logger } = getTestLoggers("messaging", "trace" as pino.Level);
  let routerMessaging: NatsRouterMessagingService;
  let messaging: NatsMessagingService;
  let router: IChannelSigner;
  let signer: IChannelSigner;
  const inbox = "mock_inbox";

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

  // TODO: replace hardcoded swapRate
  it("should properly respond with auction response when requested", async () => {
    const auctionResponse: NodeResponses.RunAuction = {
      routerPublicIdentifier: router.publicIdentifier,
      swapRate: "1",
      totalFee: config.baseFlatFee as string,
      quote: {
        amount: "2",
        recipient: mkPublicIdentifier(),
        assetId: mkAddress(),
        chainId: 123,
        expiry: "1234",
        fee: "1",
        recipientAssetId: mkAddress,
        recipientChainId: 321,
        routerIdentifier: mkPublicIdentifier(),
        signature: mkSig(),
      },
    };

    await routerMessaging.onReceiveStartAuction(
      router.publicIdentifier,
      async (result: Result<any, any>, from: string, inbox: string) => {
        expect(result.isError).to.not.be.ok;
        expect(result.getValue()).to.not.be.ok;
        expect(inbox).to.be.a("string");
        expect(from).to.be.eq(signer.publicIdentifier);
        await routerMessaging.respondToAuctionMessage(inbox, Result.ok(auctionResponse));
      },
    );

    await messaging.publishStartAuction(
      signer.publicIdentifier,
      signer.publicIdentifier,
      Result.ok({
        amount: "1",
        assetId: "0x000",
        chainId: 1,
        recipient: signer.publicIdentifier,
        recipientChainId: 1,
        recipientAssetId: "0x000",
      }),
      inbox,
    );

    await delay(1_000);
    await messaging.onReceiveAuctionMessage(signer.publicIdentifier, inbox, (runAuction) => {
      expect(runAuction.isError).to.be.false;
      expect(runAuction.getValue()).to.be.deep.eq(auctionResponse);
    });
  });
});
