import { expect } from "@connext/vector-utils";
import axios from "axios";

import { env } from "../utils";

describe("Duet Config", () => {
  it("alice & bob should pong when pinged", async () => {
    const alicePong = (await axios.get(`${env.aliceUrl}/ping`)).data;
    const bobPong = (await axios.get(`${env.bobUrl}/ping`)).data;
    expect(alicePong).to.equal("pong\n");
    expect(alicePong).to.equal(bobPong);
  });
});
