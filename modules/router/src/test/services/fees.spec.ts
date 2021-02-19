import { VectorChainReader } from "@connext/vector-contracts";
import { calculateExchangeWad, getTestLoggers, inverse, mkAddress } from "@connext/vector-utils";
import { Result, REDUCED_GAS_PRICE } from "@connext/vector-types";
import { BigNumber } from "@ethersproject/bignumber";
import axios from "axios";
import { expect } from "chai";
import Sinon from "sinon";
import { AddressZero } from "@ethersproject/constants";

import { config } from "../../config";
import { FeeError } from "../../errors";
import { getExchangeRateInEth, normalizeFee } from "../../services/fees";
import * as metrics from "../../metrics";

const testName = "Router fees";
const { log } = getTestLoggers(testName, config.logLevel ?? ("info" as any));

describe.only(testName, () => {
  let coinGeckoStub: Sinon.SinonStub;
  let ethReader: Sinon.SinonStubbedInstance<VectorChainReader>;
  let getDecimalsStub: Sinon.SinonStub;

  beforeEach(async () => {
    coinGeckoStub = Sinon.stub(axios, "get");
    ethReader = Sinon.createStubInstance(VectorChainReader);
    getDecimalsStub = Sinon.stub(metrics, "getDecimals").resolves(18);
  });

  afterEach(() => {
    Sinon.restore();
  });

  describe("calculateFeeAmount", () => {
    it("should work with base fees", async () => {});
    it("should work with swap-specific fees", async () => {});
    it("should work with only static fees", async () => {});
    it("should fail if it cannot calculate estimated gas fees", async () => {});
    it("should fail if it cannot get normalized toChannel fees", async () => {});
    it("should fail if it cannot get normalized fromChannel fees", async () => {});
    it("should not apply gas fees if it is not between chain 1", async () => {});
  });

  describe("calculateEstimatedGasFee", () => {
    it("should fail if router is not in fromChannel", async () => {});
    it("should fail if cannot get code at from channel", async () => {});
    it("should fail if cannot get rebalance profile for fromAsset", async () => {});
    it("should fail if router is not in toChannel", async () => {});
    it("should fail if cannot get swapped amount", async () => {});
    it("should fail if cannot get code at toChannel", async () => {});

    describe("should work for fromChannel actions", () => {
      it("should work if from channel will reclaim && channel is not deployed", async () => {});
      it("should work if from channel will reclaim && channel is deployed", async () => {});
      it("should work if from channel will collateralize && router is bob", async () => {});
      it("should work if from channel will collateralize && router is alice && channel is not deployed", async () => {});
      it("should work if from channel will collateralize && router is alice && channel is deployed", async () => {});
    });

    describe("should work for toChannel actions", () => {
      it("should work if to channel will do nothing", async () => {});
      it("should work if to channel will collatearlize && router is bob", async () => {});
      it("should work if to channel will collatearlize && router is alice && channel is not deployed", async () => {});
      it("should work if to channel will collatearlize && router is alice && channel is deployed", async () => {});
    });
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
      const result = await normalizeFee(fee, tokenAddress, 14, ethReader, log);
      expect(result.isError).to.be.true;
      expect(result.getError()?.message).to.be.eq(FeeError.reasons.ChainError);
      expect(result.getError()?.context.message).to.be.eq("Cannot get normalize fees that are not going to mainnet");
    });

    it("should fail if no gas price override is provided && it cannot get gas price", async () => {
      ethReader.getGasPrice.resolves(Result.fail(new Error("fail")) as any);
      const result = await normalizeFee(fee, tokenAddress, chainId, ethReader, log);
      expect(result.isError).to.be.true;
      expect(result.getError()?.message).to.be.eq(FeeError.reasons.ChainError);
      expect(result.getError()?.context.getGasPriceError).to.be.ok;
    });

    it("should fail if it cannot get decimals", async () => {
      getDecimalsStub.rejects(new Error("Fail"));
      const result = await normalizeFee(fee, tokenAddress, chainId, ethReader, log);
      expect(result.isError).to.be.true;
      expect(result.getError()?.message).to.be.eq(FeeError.reasons.ExchangeRateError);
      expect(result.getError()?.context.message).to.be.eq("Could not get decimals");
    });

    it("should work for eth", async () => {
      const result = await normalizeFee(fee, AddressZero, chainId, ethReader, log);
      expect(result.isError).to.be.false;
      expect(result.getValue()).to.be.eq(fee.mul(REDUCED_GAS_PRICE));
    });

    it("should work for tokens", async () => {
      const result = await normalizeFee(fee, tokenAddress, chainId, ethReader, log);
      expect(result.isError).to.be.false;
      expect(result.getValue()).to.be.eq(
        calculateExchangeWad(fee.mul(REDUCED_GAS_PRICE), 18, inverse(exchangeRate.toString()), 18),
      );
    });
  });

  describe("getExchangeRateInEth", () => {
    const tokenAddress = config.allowedSwaps[0].fromAssetId;

    it("should fail if http request fails", async () => {
      coinGeckoStub.rejects(new Error("fail"));
      const result = await getExchangeRateInEth(tokenAddress, log);
      expect(result.isError).to.be.true;
      expect(result.getError()!.message).to.be.eq(FeeError.reasons.ExchangeRateError);
      expect(result.getError()!.context.error).to.be.eq("fail");
    });

    it("should fail if response.data[tokenAddress].eth does not exist", async () => {
      coinGeckoStub.resolves({ data: { [tokenAddress]: {} } });
      const result = await getExchangeRateInEth(tokenAddress, log);
      expect(result.isError).to.be.true;
      expect(result.getError()!.message).to.be.eq(FeeError.reasons.ExchangeRateError);
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
