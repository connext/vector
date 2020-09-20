import { IVectorProtocol } from "@connext/vector-types";

import { getTestLoggers } from "../utils";
import { createVectorInstances, setupChannel } from "../utils/channel";

const testName = "Setup Integrations";
const { log } = getTestLoggers(testName);

describe.only(testName, () => {
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
});
