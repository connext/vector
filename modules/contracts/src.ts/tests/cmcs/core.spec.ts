import { expect } from "chai";
import { Contract } from "ethers";

import { createTestChannelFactory, createTestChannel, alice, bob } from "..";

describe("CMCCore.sol", () => {
  let channelFactory: Contract;

  beforeEach(async () => {
    const deployRes = await createTestChannelFactory();
    channelFactory = deployRes.channelFactory;
  });

  describe("setup", async () => {
    it.skip("should work", async () => {});
    it.skip("should fail if it has already been setup", async () => {});
    it.skip("should fail to setup if alice is not supplied", async () => {});
    it.skip("should fail to setup if bob is not supplied", async () => {});
    it.skip("should fail if alice == bob", async () => {});
  });

  describe("getParticipants", async () => {
    it("should get the participants from a deployed channel", async () => {
      const channel = await createTestChannel(channelFactory);
      const participants = await channel.getParticipants();
      expect(participants[0]).to.equal(alice.address);
      expect(participants[1]).to.equal(bob.address);
    });
  });
});
