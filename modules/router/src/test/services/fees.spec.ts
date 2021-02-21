import { VectorChainReader } from "@connext/vector-contracts";
import {
  calculateExchangeWad,
  createTestChannelState,
  getRandomBytes32,
  getRandomChannelSigner,
  getTestLoggers,
  inverse,
  mkAddress,
} from "@connext/vector-utils";
import { Result, REDUCED_GAS_PRICE, UpdateType, FullChannelState, GAS_ESTIMATES } from "@connext/vector-types";
import { BigNumber } from "@ethersproject/bignumber";
import axios from "axios";
import { expect } from "chai";
import Sinon from "sinon";
import { AddressZero } from "@ethersproject/constants";

import { config } from "../../config";
import * as swapService from "../../services/swap";
import * as configService from "../../services/config";
import { FeeError } from "../../errors";
import { calculateEstimatedGasFee, getExchangeRateInEth, normalizeFee } from "../../services/fees";
import * as metrics from "../../metrics";

const testName = "Router fees";
const { log } = getTestLoggers(testName, config.logLevel ?? ("info" as any));

describe.only(testName, () => {
  let coinGeckoStub: Sinon.SinonStub;
  let ethReader: Sinon.SinonStubbedInstance<VectorChainReader>;
  let getDecimalsStub: Sinon.SinonStub;
  let getRebalanceProfileStub: Sinon.SinonStub;
  let getSwappedAmountStub: Sinon.SinonStub;

  beforeEach(async () => {
    coinGeckoStub = Sinon.stub(axios, "get");
    ethReader = Sinon.createStubInstance(VectorChainReader);
    getDecimalsStub = Sinon.stub(metrics, "getDecimals").resolves(18);
    getRebalanceProfileStub = Sinon.stub(configService, "getRebalanceProfile");
    getSwappedAmountStub = Sinon.stub(swapService, "getSwappedAmount");
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
    let toSend: BigNumber;
    let routerIdentifier: string;
    let toAssetId: string;
    let fromAssetId: string;
    let toChannel: FullChannelState;
    let fromChannel: FullChannelState;

    beforeEach(() => {
      toSend = BigNumber.from(100);
      routerIdentifier = getRandomChannelSigner().publicIdentifier;
      toAssetId = mkAddress("0xaaa");
      fromAssetId = mkAddress("0xffff");
      toChannel = createTestChannelState(UpdateType.deposit, {
        channelAddress: mkAddress("0xaaa"),
        aliceIdentifier: routerIdentifier,
        assetIds: [toAssetId],
      }).channel;
      fromChannel = createTestChannelState(UpdateType.deposit, {
        channelAddress: mkAddress("0xbbb"),
        aliceIdentifier: routerIdentifier,
        assetIds: [fromAssetId],
      }).channel;

      // Stubs
      ethReader.getCode.onFirstCall().resolves(Result.ok(getRandomBytes32()));
      ethReader.getCode.onSecondCall().resolves(Result.ok(getRandomBytes32()));
      getRebalanceProfileStub.returns(
        Result.ok({
          chainId: 1,
          assetId: fromAssetId,
          reclaimThreshold: "100",
          target: "50",
          collateralizeThreshold: "25",
        }),
      );
      getSwappedAmountStub.resolves(Result.ok(toSend.mul(3)));
    });

    it("should fail if router is not in fromChannel", async () => {
      fromChannel.aliceIdentifier = getRandomChannelSigner().publicIdentifier;
      const result = await calculateEstimatedGasFee(
        toSend,
        toAssetId,
        fromAssetId,
        fromChannel,
        toChannel,
        ethReader,
        routerIdentifier,
        log,
      );
      expect(result.isError).to.be.true;
      expect(result.getError()?.message).to.be.eq(FeeError.reasons.ChannelError);
      expect(result.getError()?.context.message).to.be.eq("Not in channel");
    });

    it("should fail if cannot get code at from channel", async () => {
      ethReader.getCode.onFirstCall().resolves(Result.fail(new Error("fail")) as any);
      const result = await calculateEstimatedGasFee(
        toSend,
        toAssetId,
        fromAssetId,
        fromChannel,
        toChannel,
        ethReader,
        routerIdentifier,
        log,
      );
      expect(result.isError).to.be.true;
      expect(result.getError()?.message).to.be.eq(FeeError.reasons.ChainError);
      expect(result.getError()?.context.getCodeError).to.be.ok;
    });

    it("should fail if cannot get rebalance profile for fromAsset", async () => {
      getRebalanceProfileStub.returns(Result.fail(new Error("fail")));
      const result = await calculateEstimatedGasFee(
        toSend,
        toAssetId,
        fromAssetId,
        fromChannel,
        toChannel,
        ethReader,
        routerIdentifier,
        log,
      );
      expect(result.isError).to.be.true;
      expect(result.getError()?.message).to.be.eq(FeeError.reasons.ConfigError);
      expect(result.getError()?.context.message).to.be.eq("Failed to get rebalance profile");
    });

    it("should fail if router is not in toChannel", async () => {
      toChannel.aliceIdentifier = getRandomChannelSigner().publicIdentifier;
      const result = await calculateEstimatedGasFee(
        toSend,
        toAssetId,
        fromAssetId,
        fromChannel,
        toChannel,
        ethReader,
        routerIdentifier,
        log,
      );
      expect(result.isError).to.be.true;
      expect(result.getError()?.message).to.be.eq(FeeError.reasons.ChannelError);
      expect(result.getError()?.context.message).to.be.eq("Not in channel");
    });

    it("should fail if cannot get swapped amount", async () => {
      getSwappedAmountStub.resolves(Result.fail(new Error("fail")) as any);
      const result = await calculateEstimatedGasFee(
        toSend,
        toAssetId,
        fromAssetId,
        fromChannel,
        toChannel,
        ethReader,
        routerIdentifier,
        log,
      );
      expect(result.isError).to.be.true;
      expect(result.getError()?.message).to.be.eq(FeeError.reasons.ConversionError);
      expect(result.getError()?.context.swapError).to.be.ok;
    });

    it("should fail if cannot get code at toChannel", async () => {
      ethReader.getCode.onSecondCall().resolves(Result.fail(new Error("fail")) as any);
      const result = await calculateEstimatedGasFee(
        toSend,
        toAssetId,
        fromAssetId,
        fromChannel,
        toChannel,
        ethReader,
        routerIdentifier,
        log,
      );
      expect(result.isError).to.be.true;
      expect(result.getError()?.message).to.be.eq(FeeError.reasons.ChainError);
      expect(result.getError()?.context.getCodeError).to.be.ok;
    });

    describe("should work for fromChannel actions", () => {
      it("should work if from channel will reclaim && channel is not deployed", async () => {
        ethReader.getCode.onFirstCall().resolves(Result.ok("0x"));
        fromChannel.balances[0] = { to: [fromChannel.alice, fromChannel.bob], amount: ["780", "0"] };
        const result = await calculateEstimatedGasFee(
          toSend,
          toAssetId,
          fromAssetId,
          fromChannel,
          toChannel,
          ethReader,
          routerIdentifier,
          log,
        );
        expect(result.isError).to.be.false;
        expect(result.getValue()[fromChannel.channelAddress]).to.be.eq(
          GAS_ESTIMATES.withdraw.add(GAS_ESTIMATES.createChannel),
        );
      });

      it("should work if from channel will reclaim && channel is deployed", async () => {
        fromChannel.balances[0] = { to: [fromChannel.alice, fromChannel.bob], amount: ["780", "0"] };
        const result = await calculateEstimatedGasFee(
          toSend,
          toAssetId,
          fromAssetId,
          fromChannel,
          toChannel,
          ethReader,
          routerIdentifier,
          log,
        );
        expect(result.isError).to.be.false;
        expect(result.getValue()[fromChannel.channelAddress]).to.be.eq(GAS_ESTIMATES.withdraw);
      });

      it("should work if from channel will collateralize && router is bob", async () => {
        fromChannel.balances[0] = {
          to: [fromChannel.bob, fromChannel.alice],
          amount: ["0", "0"],
        };
        fromChannel.aliceIdentifier = fromChannel.bobIdentifier;
        fromChannel.bobIdentifier = routerIdentifier;
        const result = await calculateEstimatedGasFee(
          BigNumber.from(3),
          toAssetId,
          fromAssetId,
          fromChannel,
          toChannel,
          ethReader,
          routerIdentifier,
          log,
        );
        expect(result.isError).to.be.false;
        expect(result.getValue()[fromChannel.channelAddress]).to.be.eq(GAS_ESTIMATES.depositBob);
      });

      it("should work if from channel will collateralize && router is alice && channel is not deployed", async () => {
        ethReader.getCode.onFirstCall().resolves(Result.ok("0x"));
        fromChannel.balances[0] = {
          to: [fromChannel.alice, fromChannel.bob],
          amount: ["0", "0"],
        };
        const result = await calculateEstimatedGasFee(
          BigNumber.from(3),
          toAssetId,
          fromAssetId,
          fromChannel,
          toChannel,
          ethReader,
          routerIdentifier,
          log,
        );
        expect(result.isError).to.be.false;
        expect(result.getValue()[fromChannel.channelAddress]).to.be.eq(GAS_ESTIMATES.createChannelAndDepositAlice);
      });

      it("should work if from channel will collateralize && router is alice && channel is deployed", async () => {
        fromChannel.balances[0] = {
          to: [fromChannel.alice, fromChannel.bob],
          amount: ["0", "0"],
        };
        const result = await calculateEstimatedGasFee(
          BigNumber.from(3),
          toAssetId,
          fromAssetId,
          fromChannel,
          toChannel,
          ethReader,
          routerIdentifier,
          log,
        );
        expect(result.isError).to.be.false;
        expect(result.getValue()[fromChannel.channelAddress]).to.be.eq(GAS_ESTIMATES.depositAlice);
      });
    });

    describe("should work for toChannel actions", () => {
      it("should work if to channel will do nothing", async () => {
        toChannel.balances[0] = { to: [toChannel.alice, toChannel.bob], amount: ["780", "0"] };
        const result = await calculateEstimatedGasFee(
          toSend,
          toAssetId,
          fromAssetId,
          fromChannel,
          toChannel,
          ethReader,
          routerIdentifier,
          log,
        );
        expect(result.isError).to.be.false;
        expect(result.getValue()[toChannel.channelAddress]).to.be.eq(0);
      });

      it("should work if to channel will collatearlize && router is bob", async () => {
        toChannel.balances[0] = { to: [toChannel.bob, toChannel.alice], amount: ["0", "0"] };
        toChannel.aliceIdentifier = toChannel.bobIdentifier;
        toChannel.bobIdentifier = routerIdentifier;

        const result = await calculateEstimatedGasFee(
          toSend,
          toAssetId,
          fromAssetId,
          fromChannel,
          toChannel,
          ethReader,
          routerIdentifier,
          log,
        );
        expect(result.isError).to.be.false;
        expect(result.getValue()[toChannel.channelAddress]).to.be.eq(GAS_ESTIMATES.depositBob);
      });

      it("should work if to channel will collateralize && router is alice && channel is not deployed", async () => {
        ethReader.getCode.onSecondCall().resolves(Result.ok("0x"));
        toChannel.balances[0] = { to: [toChannel.alice, toChannel.bob], amount: ["0", "0"] };

        const result = await calculateEstimatedGasFee(
          toSend,
          toAssetId,
          fromAssetId,
          fromChannel,
          toChannel,
          ethReader,
          routerIdentifier,
          log,
        );
        expect(result.isError).to.be.false;
        expect(result.getValue()[toChannel.channelAddress]).to.be.eq(GAS_ESTIMATES.createChannelAndDepositAlice);
      });

      it("should work if to channel will collateralize && router is alice && channel is deployed", async () => {
        toChannel.balances[0] = { to: [toChannel.alice, toChannel.bob], amount: ["0", "0"] };

        const result = await calculateEstimatedGasFee(
          toSend,
          toAssetId,
          fromAssetId,
          fromChannel,
          toChannel,
          ethReader,
          routerIdentifier,
          log,
        );
        expect(result.isError).to.be.false;
        expect(result.getValue()[toChannel.channelAddress]).to.be.eq(GAS_ESTIMATES.depositAlice);
      });
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
