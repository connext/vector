import { expect } from "@connext/vector-utils";
import axios from "axios";

import { env } from "../utils";

describe("Trio Config", () => {
  it("carol, dave, and roger should pong when pinged", async () => {
    const carolPong = (await axios.get(`${env.carolUrl}/ping`)).data;
    const davePong = (await axios.get(`${env.daveUrl}/ping`)).data;
    const rogerPong = (await axios.get(`${env.rogerUrl}/ping`)).data;
    expect(carolPong).to.equal("pong\n");
    expect(carolPong).to.equal(davePong);
    expect(davePong).to.equal(rogerPong);
  });
});
