import { FullChannelState, IVectorProtocol } from "@connext/vector-types";
import { constants } from "ethers";

import { env, getTestLoggers } from "../utils";
import { getFundedChannel } from "../utils/channel";

const testName = "Happy Integration - Create";
const { log } = getTestLoggers(testName);
describe(testName, () => {
  let alice: IVectorProtocol;
  let bob: IVectorProtocol;

  let preCreateChannel: FullChannelState;

  const chainId = parseInt(Object.keys(env.chainProviders)[0]);
  const providerUrl = env.chainProviders[chainId];

  beforeEach(async () => {
    const setup = await getFundedChannel(testName, [
      {
        assetId: constants.AddressZero,
        amount: ["100", "100"],
      },
    ]);
    alice = setup.alice;
    bob = setup.bob;
    preCreateChannel = setup.channel;

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
