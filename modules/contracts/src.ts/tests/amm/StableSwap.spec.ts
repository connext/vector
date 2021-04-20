// unit test for stable swap

/* eslint-disable @typescript-eslint/no-empty-function */
import { BigNumber } from "@ethersproject/bignumber";
import { EtherSymbol, Zero } from "@ethersproject/constants";
import { formatEther, parseEther } from "@ethersproject/units";
import { Contract } from "@ethersproject/contracts";
import { deployments } from "hardhat";
import { getContract } from "../../utils";
import { alice } from "../../constants";
import { expect, mkBytes32, mkHash } from "@connext/vector-utils";

describe.only("StableSwap.sol", function () {
  this.timeout(120_000);
  let stableSwap: Contract;

  beforeEach(async () => {
    await deployments.fixture(); // Start w fresh deployments
    stableSwap = await getContract("StableSwap", alice);
  });

  describe("getAmplificationParameter", () => {
    it("happy: get amplificationParameter", async () => {
      expect(stableSwap.address).to.be.a("string");
      const res = await stableSwap.getAmplificationParameter();
      console.log(res);
      expect(res).to.be.eq(parseEther("1"));
    });
  });

  describe("onSwapGivenIn", () => {
    it("happy: run onSwapGivenIn", async () => {
      expect(stableSwap.address).to.be.a("string");
      //   uint256 amount,
      //   uint256[] memory balances,
      //   uint256 indexIn,
      //   uint256 indexOut

      const tokenA = mkBytes32("0xA");
      const tokenB = mkBytes32("0xB");
      const amount = parseEther("1");
      const balances = [parseEther("100"), parseEther("100")];
      const res = await stableSwap.onSwapGivenIn(amount, balances, 0, 1);
      console.log(res);
      console.log(res.toString());
    });
  });

  describe("onSwapGivenOut", () => {
    it("happy: run onSwapGivenOut", async () => {
      expect(stableSwap.address).to.be.a("string");
      //   uint256 amount,
      //   uint256[] memory balances,
      //   uint256 indexIn,
      //   uint256 indexOut

      const tokenA = mkBytes32("0xA");
      const tokenB = mkBytes32("0xB");
      const amount = parseEther("1");
      const balances = [parseEther("100"), parseEther("100")];
      const res = await stableSwap.onSwapGivenOut(amount, balances, 0, 1);
      console.log(res);
      console.log(res.toString());
    });
  });
});
