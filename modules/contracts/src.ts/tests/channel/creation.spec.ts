import { expect } from "@connext/vector-utils";
import { Contract } from "ethers";

import { alice, bob, provider } from "../../constants";
import { createTestChannel } from "../../utils";

describe("Channel Creation", () => {
  let channel: Contract;

  beforeEach(async () => {
    channel = await createTestChannel();
  });

  it("should be created without error", async () => {
    expect(channel.address).to.be.a("string");
    const runtimeCode = await provider.getCode(channel.address);
    expect(runtimeCode.length).to.be.gt(4);
  });

  it("should return correct participants from getParticipants()", async () => {
    const participants = await channel.getParticipants();
    expect(participants[0]).to.equal(alice.address);
    expect(participants[1]).to.equal(bob.address);
  });
});
