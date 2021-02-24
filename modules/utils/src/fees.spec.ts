import { VectorChainReader } from "@connext/vector-contracts";
import { Result, REDUCED_GAS_PRICE } from "@connext/vector-types";
import { BigNumber } from "@ethersproject/bignumber";
import { AddressZero } from "@ethersproject/constants";
import Sinon from "sinon";
import axios from "axios";

import { expect, getTestLoggers, mkAddress } from "./test";
import { normalizeFee, getExchangeRateInEth, FeeCalculationError } from "./fees";
import { calculateExchangeWad, inverse } from "./math";

const testName = "Fees utils";
const { log } = getTestLoggers(testName);

describe(testName, () => {
  let coinGeckoStub: Sinon.SinonStub;
  let ethReader: Sinon.SinonStubbedInstance<VectorChainReader>;

  beforeEach(async () => {
    coinGeckoStub = Sinon.stub(axios, "get");
    ethReader = Sinon.createStubInstance(VectorChainReader);
  });

  afterEach(() => {
    Sinon.restore();
  });

  describe("normalizeFee", () => {
    const tokenAddress = mkAddress("0xeee");
    const chainId = 1;
    const fee = BigNumber.from(20);
    const exchangeRate = 15;

    beforeEach(async () => {
      coinGeckoStub.resolves({ data: { [tokenAddress]: { eth: exchangeRate } } });
      ethReader.getGasPrice.resolves(Result.ok(REDUCED_GAS_PRICE));
    });

    it("should fail if chainId is not 1", async () => {
      const result = await normalizeFee(fee, 18, tokenAddress, 18, 14, ethReader, log);
      expect(result.isError).to.be.true;
      expect(result.getError()?.message).to.be.eq(FeeCalculationError.reasons.ChainError);
      expect(result.getError()?.context.message).to.be.eq("Cannot get normalize fees that are not going to mainnet");
    });

    it("should fail if no gas price override is provided && it cannot get gas price", async () => {
      ethReader.getGasPrice.resolves(Result.fail(new Error("fail")) as any);
      const result = await normalizeFee(fee, 18, tokenAddress, 18, chainId, ethReader, log);
      expect(result.isError).to.be.true;
      expect(result.getError()?.message).to.be.eq(FeeCalculationError.reasons.ChainError);
      expect(result.getError()?.context.getGasPriceError).to.be.ok;
    });

    it("should work for eth", async () => {
      const result = await normalizeFee(fee, 18, AddressZero, 18, chainId, ethReader, log);
      expect(result.isError).to.be.false;
      expect(result.getValue()).to.be.eq(fee.mul(REDUCED_GAS_PRICE));
    });

    it("should work for tokens", async () => {
      const result = await normalizeFee(fee, 18, tokenAddress, 18, chainId, ethReader, log);
      expect(result.isError).to.be.false;
      expect(result.getValue()).to.be.eq(
        calculateExchangeWad(fee.mul(REDUCED_GAS_PRICE), 18, inverse(exchangeRate.toString()), 18),
      );
    });
  });

  describe("getExchangeRateInEth", () => {
    const tokenAddress = mkAddress("0xeeeee");

    it("should fail if http request fails", async () => {
      coinGeckoStub.rejects(new Error("fail"));
      const result = await getExchangeRateInEth(tokenAddress, log);
      expect(result.isError).to.be.true;
      expect(result.getError()!.message).to.be.eq(FeeCalculationError.reasons.ExchangeRateError);
      expect(result.getError()!.context.error).to.be.eq("fail");
    });

    it("should fail if response.data[tokenAddress].eth does not exist", async () => {
      coinGeckoStub.resolves({ data: { [tokenAddress]: {} } });
      const result = await getExchangeRateInEth(tokenAddress, log);
      expect(result.isError).to.be.true;
      expect(result.getError()!.message).to.be.eq(FeeCalculationError.reasons.ExchangeRateError);
      expect(result.getError()!.context.message).to.be.eq("Could not find rate in response");
    });

    it("should work", async () => {
      const exchangeRate = 15;
      coinGeckoStub.resolves({ data: { [tokenAddress]: { eth: exchangeRate } } });
      const result = await getExchangeRateInEth(tokenAddress, log);
      expect(result.isError).to.be.false;
      expect(result.getValue()).to.be.eq(exchangeRate);
    });
  });
});
