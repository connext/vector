import { expect } from "@connext/vector-utils";
import axios from "axios";

import { env } from "../utils";

describe("Node Config", () => {
  it("should ping when we pong", async () => {
    const res = await axios.get(`${env.nodeUrl}/ping`);
    expect(res.data).to.equal("pong\n");
  });
});
