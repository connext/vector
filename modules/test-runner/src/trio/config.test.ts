import axios from "axios";

import { env, expect } from "../utils";

describe("Trio Config", () => {
  it("alice, bob, and node should pong when pinged", async () => {
    const alicePong = (await axios.get(`${env.aliceUrl}/ping`)).data;
    const bobPong = (await axios.get(`${env.bobUrl}/ping`)).data;
    const nodePong = (await axios.get(`${env.nodeUrl}/ping`)).data;
    expect(alicePong).to.equal("pong\n");
    expect(alicePong).to.equal(bobPong);
    expect(bobPong).to.equal(nodePong);
  });
});
