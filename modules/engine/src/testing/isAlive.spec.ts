import { Result } from "@connext/vector-types";
import {
  createTestChannelState,
  expect,
  getRandomChannelSigner,
  getTestLoggers,
  MemoryMessagingService,
  MemoryStoreService,
  mkAddress,
  mkPublicIdentifier,
} from "@connext/vector-utils";
import Sinon from "sinon";

import { sendIsAlive } from "../isAlive";

import { env } from "./env";

describe("checkIn", () => {
  const testName = "checkIn";
  const { log } = getTestLoggers(testName, env.logLevel);

  let storeService: Sinon.SinonStubbedInstance<MemoryStoreService>;
  let messagingService: Sinon.SinonStubbedInstance<MemoryMessagingService>;
  beforeEach(() => {
    storeService = Sinon.createStubInstance(MemoryStoreService);
    messagingService = Sinon.createStubInstance(MemoryMessagingService);
  });

  it("should send no checkIn messages if there are no channels", async () => {
    const signer = getRandomChannelSigner();
    storeService.getChannelStates.resolves([]);
    await sendIsAlive(signer, messagingService, storeService, log);
    expect(messagingService.sendIsAliveMessage.called).to.be.false;
  });

  it("should send checkIn messages to all channels", async () => {
    const signer = getRandomChannelSigner();
    const channel1 = createTestChannelState("create", {
      alice: signer.address,
      bob: mkAddress("0xbbb"),
      aliceIdentifier: signer.publicIdentifier,
      bobIdentifier: mkPublicIdentifier("vectorBBB"),
    }).channel;
    const channel2 = createTestChannelState("resolve", {
      bob: signer.address,
      alice: mkAddress("0xccc"),
      bobIdentifier: signer.publicIdentifier,
      aliceIdentifier: mkPublicIdentifier("vectorCCC"),
    }).channel;
    messagingService.sendIsAliveMessage.resolves(Result.ok({ channelAddress: channel1.channelAddress }));
    storeService.getChannelStates.resolves([channel1, channel2]);

    await sendIsAlive(signer, messagingService, storeService, log);
    expect(messagingService.sendIsAliveMessage.callCount).to.eq(2);
  });
});
