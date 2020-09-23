import { Contract } from "ethers";

import { expect } from "../utils";

import { createChannel } from "./creation.spec";

describe("Channel Deposits", () => {
  let channel: Contract;

  beforeEach(async () => {
    channel = await createChannel();
  });

  it("should accept a deposit", async () => {
    // TODO
    expect(channel.address).to.be.a("string");
  });

  it("should accept a deposit", async () => {
    // TODO
    expect(channel.address).to.be.a("string");
  });

});
