import { expect } from "chai";
import { BigNumber } from "ethers";

import { isBN, isBNJson, getBigNumberError, getBigNumberishError } from "./bigNumbers";

const TEST_BN = BigNumber.from(1);
const TEST_BN_JSON_1 = { _hex: "0x01" };
// const TEST_BN_JSON_2 = { _hex: "0x01", _isBigNumber: true };
const TEST_BN_INVALID = { amount: 1 };

describe("BigNumbers", () => {
  describe("isBN", () => {
    it("return true for BigNumber object", () => {
      expect(isBN(TEST_BN)).to.equal(true);
    });
    it("return false for BigNumber json without _isBigNumber", () => {
      expect(isBN(TEST_BN_JSON_1)).to.equal(false);
    });
    // it("return false for BigNumber json with _isBigNumber", () => {
    //   expect(isBN(TEST_BN_JSON_2)).to.equal(false);
    // });
  });
  describe("isBNJson", () => {
    it("return false for BigNumber object", () => {
      expect(isBNJson(TEST_BN)).to.equal(false);
    });
    it("return true for BigNumber json without _isBigNumber", () => {
      expect(isBNJson(TEST_BN_JSON_1)).to.equal(true);
    });
    // it("return true for BigNumber json with _isBigNumber", () => {
    //   expect(isBNJson(TEST_BN_JSON_2)).to.equal(true);
    // });
  });
  describe("getBigNumberError", () => {
    it("return undefined for valid BigNumber", () => {
      expect(getBigNumberError(TEST_BN)).to.equal(undefined);
    });
    it("return error message for invalid BigNumber", () => {
      expect(getBigNumberError(TEST_BN_INVALID)).to.equal(
        `Value "${TEST_BN_INVALID}" is not a BigNumber`,
      );
    });
  });
  describe("getBigNumberishError", () => {
    it("return", () => {
      expect(getBigNumberishError(TEST_BN)).to.equal(undefined);
    });
    it.skip("return error message for invalid BigNumberish", () => {
      expect(
        getBigNumberishError(TEST_BN_INVALID).startsWith(
          `Value "${TEST_BN_INVALID}" is not BigNumberish:`,
        ),
      ).to.equal(true);
    });
  });
});
