import { expect } from "@connext/vector-utils";
import axios from "axios";

import { env } from "../utils";

describe("Router Config", () => {
  it("node should ping when we pong", async () => {
    const res = await axios.get(`${env.nodeUrl}/ping`);
    expect(res.data).to.equal("pong\n");
  });

  it("router should ping when we pong", async () => {
    const res = await axios.get(`${env.routerUrl}/ping`);
    expect(res.data).to.equal("pong\n");
  });
});
