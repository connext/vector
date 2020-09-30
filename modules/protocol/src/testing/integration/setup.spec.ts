/* eslint-disable @typescript-eslint/no-empty-function */
import { IVectorProtocol } from "@connext/vector-types";

import { createVectorInstances, setupChannel, getTestLoggers, expect } from "../utils";

const testName = "Setup Integrations";
const { log } = getTestLoggers(testName);

describe(testName, () => {
  let alice: IVectorProtocol;
  let bob: IVectorProtocol;
  let tony: IVectorProtocol;

  beforeEach(async () => {
    [alice, bob, tony] = await createVectorInstances(true, 3);

    log.info({
      alice: alice.publicIdentifier,
      bob: bob.publicIdentifier,
      tony: tony.publicIdentifier,
    });
  });

  it("should setup a channel between Alice and Bob", async () => {
    await setupChannel(alice, bob);
  });

  it("should work concurrently", async () => {
    const concurrentResult = await Promise.all([
      setupChannel(alice, bob),
      setupChannel(alice, tony)
    ]);
    log.info(concurrentResult)
  });
});
