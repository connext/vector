import { expect, RestServerNodeService, mkAddress } from "@connext/vector-utils";
import axios from "axios";

import { env, getTestLoggers } from "../utils";

const testName = "Duet Config";

const { log } = getTestLoggers(testName);

describe(testName, () => {
  it("alice & bob should pong when pinged", async () => {
    const alicePong = (await axios.get(`${env.aliceUrl}/ping`)).data;
    const bobPong = (await axios.get(`${env.bobUrl}/ping`)).data;
    expect(alicePong).to.equal("pong\n");
    expect(alicePong).to.equal(bobPong);
  });

  it("should work with a default identifier", async () => {
    const alice = await RestServerNodeService.connect(env.aliceUrl, log, undefined, 0);

    const res = await alice.getConfig();
    const val = res.getValue();
    expect(val.length >= 1).to.be.true;
    expect(val[0].signerAddress).to.be.ok;
    expect(val[0].publicIdentifier).to.be.ok;

    const test = await alice.getStateChannel({ channelAddress: mkAddress("0xccc") });

    const err = test.getError()!;
    expect(err.context.stack).to.be.ok;
  });
});
