import { ChannelFactory } from "@connext/vector-contracts";
import { JsonRpcProvider } from "@connext/vector-types";
import { ChannelSigner, getRandomChannelSigner } from "@connext/vector-utils";
import { BigNumber, constants, Contract } from "ethers";

import { Vector } from "../vector";

import { MemoryLockService } from "./services/lock";
import { MemoryMessagingService } from "./services/messaging";
import { MemoryStoreService } from "./services/store";
import { env, expect, getTestLoggers } from "./utils";

const testName = "Happy Integration - Create";
const { log } = getTestLoggers(testName);
describe(testName, () => {
  let alice: Vector;
  let bob: Vector;

  const chainId = parseInt(Object.keys(env.chainProviders)[0]);
  const providerUrl = env.chainProviders[chainId];
  const wallet = env.sugarDaddy.connect(new JsonRpcProvider(providerUrl));

  beforeEach(async () => {
    const messaging = new MemoryMessagingService();
    const lock = new MemoryLockService();

    alice = await Vector.connect(
      messaging,
      lock,
      new MemoryStoreService(),
      new ChannelSigner(wallet.privateKey, providerUrl),
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

  it.skip("should work for Alice paying Bob", async () => {});
  it.skip("should work for Bob paying Alice", async () => {});
  it.skip("should work for withdraw", async () => {});
  it.skip("should work for many concurrent transfers with multiple parties", async () => {});
});
