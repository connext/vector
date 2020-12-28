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
    expect(messagingService.sendCheckInMessage.called).to.be.false;
  });

  it("should send checkIn messages to all channels", async () => {
    messagingService.sendCheckInMessage.resolves(Result.ok(undefined));
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
    storeService.getChannelStates.resolves([channel1, channel2]);

    await sendIsAlive(signer, messagingService, storeService, log);
    expect(messagingService.sendCheckInMessage.callCount).to.eq(2);
  });
});
