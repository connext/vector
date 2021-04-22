// unit test for stable swap

/* eslint-disable @typescript-eslint/no-empty-function */

import { formatEther, parseEther } from "@ethersproject/units";
import { Contract } from "@ethersproject/contracts";
import { deployments } from "hardhat";
import { getContract } from "../../utils";
import { alice } from "../../constants";
import { expect } from "@connext/vector-utils";

describe("StableSwap.sol", function () {
  this.timeout(120_000);
  let stableSwap: Contract;
  let amount30 = parseEther("30");
  let amount60 = parseEther("60");
  let amount90 = parseEther("90");
  let amount95 = parseEther("95");
  let amount99 = parseEther("99");
  let balances = [parseEther("100"), parseEther("100"), parseEther("100")];

  beforeEach(async () => {
    await deployments.fixture(); // Start w fresh deployments
    stableSwap = await getContract("StableSwap", alice);
  });

  describe("getAmplificationParameter", () => {
    it("happy: get amplificationParameter", async () => {
      expect(stableSwap.address).to.be.a("string");
      const res = await stableSwap.getAmplificationParameter();
      console.log(res);
      //   expect(res).to.be.eq(parseEther("1"));
    });
  });

  describe("onSwapGivenIn", () => {
    it("happy: run onSwapGivenIn 30", async () => {
      expect(stableSwap.address).to.be.a("string");
      const res = await stableSwap.onSwapGivenIn(amount30, balances, 0, 1);
      console.log(res.toString());
      console.log(formatEther(res));
    });

    it("happy: run onSwapGivenIn 60", async () => {
      expect(stableSwap.address).to.be.a("string");
      const res = await stableSwap.onSwapGivenIn(amount60, balances, 0, 1);
      console.log(res.toString());
      console.log(formatEther(res));
    });

    it("happy: run onSwapGivenIn 90", async () => {
      expect(stableSwap.address).to.be.a("string");
      const res = await stableSwap.onSwapGivenIn(amount90, balances, 0, 1);
      console.log(res.toString());
      console.log(formatEther(res));
    });
    it("happy: run onSwapGivenIn 95", async () => {
      expect(stableSwap.address).to.be.a("string");
      const res = await stableSwap.onSwapGivenIn(amount95, balances, 0, 1);
      console.log(res.toString());
      console.log(formatEther(res));
    });
    it("happy: run onSwapGivenIn 99", async () => {
      expect(stableSwap.address).to.be.a("string");
      const res = await stableSwap.onSwapGivenIn(amount99, balances, 0, 1);
      console.log(res.toString());
      console.log(formatEther(res));
    });
  });

  describe("onSwapGivenOut", () => {
    it("happy: run onSwapGivenOut 30", async () => {
      expect(stableSwap.address).to.be.a("string");
      const res = await stableSwap.onSwapGivenOut(amount30, balances, 0, 1);
      console.log(res.toString());
      console.log(formatEther(res));
    });

    it("happy: run onSwapGivenOut 60", async () => {
      expect(stableSwap.address).to.be.a("string");
      const res = await stableSwap.onSwapGivenOut(amount60, balances, 0, 1);
      console.log(res.toString());
      console.log(formatEther(res));
    });

    it("happy: run onSwapGivenOut 90", async () => {
      expect(stableSwap.address).to.be.a("string");
      const res = await stableSwap.onSwapGivenOut(amount90, balances, 0, 1);
      console.log(res.toString());
      console.log(formatEther(res));
    });
  });
});
