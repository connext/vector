import { getRandomChannelSigner } from "@connext/vector-utils";

import { Vector } from "../vector";

import { MemoryLockService } from "./services/lock";
import { MemoryMessagingService } from "./services/messaging";
import { MemoryStoreService } from "./services/store";
import { env, expect, getTestLoggers } from "./utils";

const testName = "Happy Integrations";
const { log } = getTestLoggers(testName);
describe(testName, () => {
  let alice: Vector;
  let bob: Vector;

  beforeEach(async () => {
    const messaging = new MemoryMessagingService();
    const lock = new MemoryLockService();

    alice = await Vector.connect(
      messaging,
      lock,
      new MemoryStoreService(),
      getRandomChannelSigner(),
      env.chainProviders,
      log.child({ participant: "Alice" }),
    );

    bob = await Vector.connect(
      messaging,
      lock,
      new MemoryStoreService(),
      getRandomChannelSigner(),
      env.chainProviders,
      log.child({ participant: "Bob" }),
    );

    log.info({
      alice: alice.publicIdentifier,
      bob: bob.publicIdentifier,
    });
  });

  it("should setup a channel between Alice and Bob", async () => {
    const chainId = parseInt(Object.keys(env.chainProviders)[0]);
    const channel = await alice.setup({
      counterpartyIdentifier: bob.publicIdentifier,
      networkContext: {
        adjudicatorAddress: env.chainAddresses[chainId].Adjudicator.address,
        chainId,
        channelFactoryAddress: env.chainAddresses[chainId].ChannelFactory.address,
        providerUrl: env.chainProviders[chainId],
        vectorChannelMastercopyAddress: env.chainAddresses[chainId].VectorChannel.address,
      },
      timeout: "3600",
    });
    expect(channel.isError).to.not.be.ok;

    const aliceChannel = await alice.getChannelState(channel.getValue().channelAddress);
    const bobChannel = await bob.getChannelState(channel.getValue().channelAddress);

    expect(aliceChannel).to.deep.eq(bobChannel);
  });
});
