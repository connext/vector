import axios from "axios";

import { env, expect } from "../utils";

describe("Global Auth Service", () => {

  it("should ping when we pong", async () => {
    const res = await axios.get(`${env.authUrl}/ping`);
    expect(res.data).to.equal("pong\n");
  });

});

