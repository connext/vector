import { expect } from "@connext/vector-utils";
import axios from "axios";

import { env } from "../utils";

describe("Node Config", () => {
  it("should ping when we pong", async () => {
    const res = await axios.get(`${env.nodeContainerUrl}/ping`);
    expect(res.data).to.equal("pong\n");
  });
  it("should create a node & provide it's status", async () => {
    const createRes = await axios.post(`${env.nodeContainerUrl}/node`, { index: 0 });
    expect(createRes.data).to.be.ok;
    const pubId = createRes.data.publicIdentifier;
    expect(pubId).to.be.a("string");
    const statusRes = await axios.get(`${env.nodeContainerUrl}/${pubId}/status`);
    expect(statusRes.data).to.be.ok;
    expect(statusRes.data.version).to.be.a("string");
  });
});
