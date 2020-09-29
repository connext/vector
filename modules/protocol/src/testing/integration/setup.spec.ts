/* eslint-disable @typescript-eslint/no-empty-function */
import { getTestLoggers } from "@connext/vector-utils";
import { IVectorProtocol } from "@connext/vector-types";

import { createVectorInstances, setupChannel } from "../utils";
import { env } from "../env";

const testName = "Setup Integrations";
const { log } = getTestLoggers(testName, env.logLevel);

describe(testName, () => {
  let alice: IVectorProtocol;
  let bob: IVectorProtocol;

  beforeEach(async () => {
    [alice, bob] = await createVectorInstances(true, 2);

    log.info({
      alice: alice.publicIdentifier,
      bob: bob.publicIdentifier,
    });
  });

  it("should setup a channel between Alice and Bob", async () => {
    await setupChannel(alice, bob);
  });

  it.skip("should work concurrently", async () => {});
});
