import { getRandomChannelSigner } from "@connext/vector-utils";
import { expect } from "chai";
import pino from "pino";

import { Vector } from "../vector";

import { config } from "./services/config";
import { MemoryLockService } from "./services/lock";
import { MemoryMessagingService } from "./services/messaging";
import { MemoryStoreService } from "./services/store";

describe("Happy case integration tests", () => {
  let alice: Vector;
  let bob: Vector;

  beforeEach(async () => {
    const messaging = new MemoryMessagingService();
    const lock = new MemoryLockService();
    const logger = pino({ level: config.logLevel });

    alice = await Vector.connect(
      messaging,
      lock,
      new MemoryStoreService(),
      getRandomChannelSigner(),
      config.chainProviders,
      logger.child({ participant: "Alice" }),
    );

    bob = await Vector.connect(
      messaging,
      lock,
      new MemoryStoreService(),
      getRandomChannelSigner(),
      config.chainProviders,
      logger.child({ participant: "Bob" }),
    );

    logger.info({
      alice: alice.publicIdentifier,
      bob: bob.publicIdentifier,
    });
  });

  it.only("should setup a channel between Alice and Bob", async () => {
    const chainId = parseInt(Object.keys(config.chainProviders)[0]);
    const channel = await alice.setup({
      counterpartyIdentifier: bob.publicIdentifier,
      networkContext: {
        adjudicatorAddress: config.chainAddresses[chainId].Adjudicator.address,
        chainId,
        channelFactoryAddress: config.chainAddresses[chainId].ChannelFactory.address,
        providerUrl: config.chainProviders[chainId],
        vectorChannelMastercopyAddress: config.chainAddresses[chainId].VectorChannel.address,
      },
      timeout: "3600",
    });
    expect(channel.isError).to.not.be.ok;

    const aliceChannel = await alice.getChannelState(channel.getValue().channelAddress);
    const bobChannel = await bob.getChannelState(channel.getValue().channelAddress);

    expect(aliceChannel).to.deep.eq(bobChannel);
  });
});
