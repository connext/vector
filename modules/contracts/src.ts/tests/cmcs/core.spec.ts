/* eslint-disable @typescript-eslint/no-empty-function */
import { AddressZero } from "@ethersproject/constants";
import { expect } from "chai";
import { Contract } from "ethers";

import { getTestChannel, alice, bob, getUnsetupChannel } from "..";

// NOTE: This will use a channel deployed by the `TestChannelFactory` that
// has not been setup on deploy. Otherwise, the

describe("CMCCore.sol", () => {
  let channel: Contract;

  describe("setup", async () => {
    beforeEach(async () => {
      channel = await getUnsetupChannel();
    });

    it("should work", async () => {
      const setupTx = await channel.setup(alice.address, bob.address);
      await setupTx.wait();

      expect(await channel.getAlice()).to.be.eq(alice.address);
      expect(await channel.getBob()).to.be.eq(bob.address);
    });

    it("should fail if it has already been setup", async () => {
      const setupTx = await channel.setup(alice.address, bob.address);
      await setupTx.wait();

      await expect(channel.setup(alice.address, bob.address)).revertedWith("ReentrancyGuard: cannot initialize twice");
    });

    it("should fail to setup if alice is not supplied", async () => {
      await expect(channel.setup(AddressZero, bob.address)).revertedWith(
        "Address zero not allowed as channel participant",
      );
    });

    it("should fail to setup if bob is not supplied", async () => {
      await expect(channel.setup(AddressZero, bob.address)).revertedWith(
        "Address zero not allowed as channel participant",
      );
    });

    it("should fail if alice == bob", async () => {
      await expect(channel.setup(alice.address, alice.address)).revertedWith(
        "Channel participants must be different from each other",
      );
    });
  });

  describe("getters", async () => {
    beforeEach(async () => {
      channel = await getTestChannel();
    });

    it("should work", async () => {
      expect(await channel.getAlice()).to.equal(alice.address);
      expect(await channel.getBob()).to.equal(bob.address);
    });
  });
});
