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
  let carol: IVectorProtocol;

  beforeEach(async () => {
    [alice, bob, carol] = await createVectorInstances(true, 3);

    log.info({
      alice: alice.publicIdentifier,
      bob: bob.publicIdentifier,
      tony: carol.publicIdentifier,
    });
  });

  it("should setup a channel between Alice and Bob", async () => {
    await setupChannel(alice, bob);
  });

  it("should work concurrently for Alice + Bob and Alice + Carol channel", async () => {
    const concurrentResult = await Promise.all([setupChannel(alice, bob), setupChannel(alice, carol)]);
    log.info(concurrentResult);
  });
});
