import { getTestLoggers } from "@connext/vector-utils";
import axios, { AxiosStatic } from "axios";
import { expect } from "chai";
import Sinon from "sinon";

import { config } from "../../config";
import { FeeError } from "../../errors";
import { getExchangeRateInEth } from "../../services/fees";

const testName = "Router fees";
const { log } = getTestLoggers(testName, config.logLevel ?? ("info" as any));

describe(testName, () => {
  let coinGeckoStub: Sinon.SinonStub;

  beforeEach(async () => {
    coinGeckoStub = Sinon.stub(axios, "get");
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
    it("should fail if chainId is not 1", async () => {});
    it("should fail if no gas price override is provided && it cannot get gas price", async () => {});
    it("should work for eth", async () => {});
    it("should work for tokens", async () => {});
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
