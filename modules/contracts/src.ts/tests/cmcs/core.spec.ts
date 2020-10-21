/* eslint-disable @typescript-eslint/no-empty-function */
import { expect } from "chai";
import { Contract } from "ethers";

import { getTestChannel, alice, bob } from "..";

describe("CMCCore.sol", () => {
  let channel: Contract;

  beforeEach(async () => {
    channel = await getTestChannel();
  });

  describe("setup", async () => {
    it.skip("should work", async () => {});
    it.skip("should fail if it has already been setup", async () => {});
    it.skip("should fail to setup if alice is not supplied", async () => {});
    it.skip("should fail to setup if bob is not supplied", async () => {});
    it.skip("should fail if alice == bob", async () => {});
  });

  describe("getters", async () => {
    it("should work", async () => {
      expect(await channel.getMastercopy()).to.be.a("string");
      expect(await channel.getAlice()).to.equal(alice.address);
      expect(await channel.getBob()).to.equal(bob.address);
    });
  });
});
