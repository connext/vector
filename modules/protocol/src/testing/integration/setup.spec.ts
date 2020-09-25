import { IVectorProtocol } from "@connext/vector-types";

import { createVectorInstances, setupChannel, getTestLoggers } from "../utils";

const testName = "Setup Integrations";
const { log } = getTestLoggers(testName);

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
