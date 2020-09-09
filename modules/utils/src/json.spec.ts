import { expect } from "chai";
import { BigNumber } from "ethers";

import { bigNumberifyJson, deBigNumberifyJson, safeJsonParse, safeJsonStringify } from "./json";

const TEST_JSON = { test: "something", nullfied: undefined };
const TEST_JSON_WITH_NULL = { test: "something", nullfied: null };
const VALID_JSON_STRING = `{"test":"something","nullfied":null}`;
const INVALID_JSON_STRING = VALID_JSON_STRING.replace("{", "");

const TEST_JSON_WITH_BN_OBJ = { amount: BigNumber.from(1) };
const TEST_JSON_WITH_BN_JSON = { amount: { _hex: "0x01", _isBigNumber: true } };
// const TEST_JSON_WITH_BN_JSON = { amount: { _hex: "0x01", _isBigNumber: true } };

describe("JSON", () => {
  describe("bigNumberifyJson", () => {
    it("return json with BigNumber values", () => {
      const input = TEST_JSON_WITH_BN_JSON;
      const expected = TEST_JSON_WITH_BN_OBJ;
      const result = bigNumberifyJson(input);
      expect(result).to.deep.equal(expected);
    });
  });
  describe("deBigNumberifyJson", () => {
    it("return json with BigNumberJson values", () => {
      const input = TEST_JSON_WITH_BN_OBJ;
      const expected = TEST_JSON_WITH_BN_JSON;
      const result = deBigNumberifyJson(input);
      expect(result).to.deep.equal(expected);
    });
  });
  describe("safeJsonStringify", () => {
    it("return stringified json if provided valid json", () => {
      const input = TEST_JSON;
      const expected = VALID_JSON_STRING;
      const result = safeJsonStringify(input);
      expect(result).to.deep.equal(expected);
    });
  });
  describe("safeJsonParse", () => {
    it("return valid json if provided valid stringified json", () => {
      const input = VALID_JSON_STRING;
      const expected = TEST_JSON_WITH_NULL;
      const result = safeJsonParse(input);
      expect(result).to.deep.equal(expected);
    });
    it("return same input if provided invalid stringified json", () => {
      const input = INVALID_JSON_STRING;
      const expected = INVALID_JSON_STRING;
      const result = safeJsonParse(input);
      expect(result).to.deep.equal(expected);
    });
    it("return same input if not provided a string", () => {
      const input = TEST_JSON;
      const expected = TEST_JSON;
      const result = safeJsonParse(input);
      expect(result).to.deep.equal(expected);
    });
  });
});
