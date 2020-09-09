import { expect } from "chai";

import {
  toWad,
  fromWad,
  inverse,
  sanitizeDecimals,
  removeDecimals,
  calculateExchangeAmount,
  calculateExchangeWad,
  formatDisplayAmount,
} from "./math";

describe("Math", () => {
  it("toWad", () => {
    expect(toWad("1").toString()).to.be.equal("1000000000000000000");
    expect(toWad("1", 18).toString()).to.be.equal("1000000000000000000");
    expect(toWad("1", 8).toString()).to.be.equal("100000000");
    expect(toWad("1", 0).toString()).to.be.equal("1");
  });
  it("fromWad", () => {
    expect(fromWad("1000000000000000000")).to.be.equal("1");
    expect(fromWad("1000000000000000000", 18)).to.be.equal("1");
    expect(fromWad("100000000", 8)).to.be.equal("1");
    expect(fromWad("1", 0)).to.be.equal("1");
  });
  it("inverse", () => {
    expect(inverse("0.01")).to.be.equal("100");
    expect(inverse("100")).to.be.equal("0.01");
    expect(inverse("1")).to.be.equal("1");
  });
  it("sanitizeDecimals", () => {
    expect(sanitizeDecimals("100.2901385789273895723895782234234234234234234234233")).to.be.equal(
      "100.290138578927389572",
    );
    expect(sanitizeDecimals("100.0000000")).to.be.equal("100");
    expect(sanitizeDecimals("100.0002000")).to.be.equal("100.0002");
  });
  it("removeDecimals", () => {
    expect(removeDecimals("100.29")).to.be.equal("100");
    expect(removeDecimals("100")).to.be.equal("100");
  });
  it("calculateExchangeAmount", () => {
    expect(calculateExchangeAmount("0.1", "100")).to.be.equal("10");
    expect(calculateExchangeAmount("0.1", "212.5")).to.be.equal("21.25");
    expect(calculateExchangeAmount("10", inverse("100"))).to.be.equal("0.1");
    expect(calculateExchangeAmount("21.25", inverse("212.5"))).to.be.equal("0.09999999999999999");
  });
  it("calculateExchangeWad", () => {
    expect(calculateExchangeWad(toWad("0.1"), 18, "100", 8).toString()).to.be.equal("1000000000");
    expect(calculateExchangeWad(toWad("0.1"), 18, "212.5", 8).toString()).to.be.equal("2125000000");
    expect(calculateExchangeWad(toWad("10"), 8, inverse("100"), 18).toString()).to.be.equal(
      "1000000000000000000000000000",
    );
    expect(calculateExchangeWad(toWad("21.25"), 8, inverse("212.5"), 18).toString()).to.be.equal(
      "999999999999999900000000000",
    );
  });
  it("formatDisplayAmount", () => {
    expect(formatDisplayAmount("0.1", 2, "DAI")).to.be.equal("DAI 0.10");
    expect(formatDisplayAmount("0.1")).to.be.equal("0.10");
    expect(formatDisplayAmount("0.123544235", 4)).to.be.equal("0.1235");
    expect(formatDisplayAmount("0.999999999", 4)).to.be.equal("1.0000");
    expect(formatDisplayAmount("10")).to.be.equal("10.00");
    expect(formatDisplayAmount("10.0")).to.be.equal("10.00");
  });
});
