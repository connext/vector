import { VectorChainReader } from "@connext/vector-contracts";
import * as vectorUtils from "@connext/vector-utils";
import {
  Result,
  UpdateType,
  FullChannelState,
  SIMPLE_WITHDRAWAL_GAS_ESTIMATE,
  IVectorChainReader,
  GAS_ESTIMATES,
} from "@connext/vector-types";
import { BigNumber } from "@ethersproject/bignumber";
import { expect } from "chai";
import Sinon from "sinon";

import { getConfig } from "../../config";
import * as swapService from "../../services/swap";
import * as configService from "../../services/config";
import { FeeError } from "../../errors";
import * as feesService from "../../services/fees";
import * as metrics from "../../metrics";
import * as utils from "../../services/utils";
import { parseEther } from "ethers/lib/utils";
import { One, Zero } from "@ethersproject/constants";

const config = getConfig();

const testName = "Router fees";
const { log } = vectorUtils.getTestLoggers(testName, config.logLevel ?? ("info" as any));

describe(testName, () => {
  let ethReader: Sinon.SinonStubbedInstance<VectorChainReader>;
  let getRebalanceProfileStub: Sinon.SinonStub;
  let getSwappedAmountStub: Sinon.SinonStub;
  let onSwapGivenInStub: Sinon.SinonStub;
  let getFeesStub: Sinon.SinonStub;
  let getDecimalsStub: Sinon.SinonStub;

  beforeEach(async () => {
    ethReader = Sinon.createStubInstance(VectorChainReader);
    getRebalanceProfileStub = Sinon.stub(configService, "getRebalanceProfile");
    onSwapGivenInStub = Sinon.stub(configService, "onSwapGivenIn");
    getSwappedAmountStub = Sinon.stub(swapService, "getSwappedAmount");
    getFeesStub = Sinon.stub(configService, "getSwapFees");
    getDecimalsStub = Sinon.stub(metrics, "getDecimals").resolves(18);

    // setup gas fees stubs
    // from channel calls
    // to channel calls
  });

  afterEach(() => {
    Sinon.restore();
  });

  describe("calculateFeeAmount", () => {
    let transferAmount: BigNumber;
    let routerIdentifier: string;
    let fromAssetId: string;
    let fromChannel: FullChannelState;
    let toAssetId: string;
    let toChannel: FullChannelState;
    let calculateEstimatedGasFeeStub: Sinon.SinonStub;
    let normalizedGasFeesStub: Sinon.SinonStub;

    let fees: { flatFee: string; percentageFee: number; gasSubsidyPercentage: number };
    let gasFees: [fromFee: BigNumber, toFee: BigNumber];

    beforeEach(() => {
      // default values
      transferAmount = BigNumber.from(100);
      routerIdentifier = vectorUtils.getRandomChannelSigner().publicIdentifier;
      toAssetId = vectorUtils.mkAddress("0xaaa");
      fromAssetId = vectorUtils.mkAddress("0xffff");
      toChannel = vectorUtils.createTestChannelState(UpdateType.deposit, {
        channelAddress: vectorUtils.mkAddress("0xaaa"),
        aliceIdentifier: routerIdentifier,
        assetIds: [toAssetId],
        networkContext: { chainId: 1 },
      }).channel;
      fromChannel = vectorUtils.createTestChannelState(UpdateType.deposit, {
        channelAddress: vectorUtils.mkAddress("0xbbb"),
        aliceIdentifier: routerIdentifier,
        assetIds: [fromAssetId],
        networkContext: { chainId: 1 },
      }).channel;
      fees = {
        percentageFee: 5,
        flatFee: "300",
        gasSubsidyPercentage: 0,
      };
      gasFees = [BigNumber.from(50), BigNumber.from(25)];

      // default stubs
      onSwapGivenInStub.resolves(Result.ok({ priceImpact: "0", amountOut: transferAmount }));
      getFeesStub.returns(Result.ok(fees));
      calculateEstimatedGasFeeStub = Sinon.stub(feesService, "calculateEstimatedGasFee");
      calculateEstimatedGasFeeStub.resolves(Result.ok(gasFees));

      // by default, these functions should only return gas fee values
      // i.e. they do nothing
      normalizedGasFeesStub = Sinon.stub(utils, "normalizeGasFees");
      normalizedGasFeesStub.onFirstCall().resolves(Result.ok(gasFees[0]));
      normalizedGasFeesStub.onSecondCall().resolves(Result.ok(gasFees[1]));
      getSwappedAmountStub.resolves(Result.ok(gasFees[1]));
    });

    it("should work with only static fees", async () => {
      fees.gasSubsidyPercentage = 100;
      getFeesStub.returns(Result.ok(fees));
      const result = await feesService.calculateFeeAmount(
        transferAmount,
        false,
        fromAssetId,
        fromChannel.networkContext.chainId,
        toAssetId,
        toChannel.networkContext.chainId,
        ethReader as IVectorChainReader,
        routerIdentifier,
        log,
        fromChannel,
        toChannel,
      );
      expect(result.isError).to.be.false;
      const { fee, amount } = result.getValue();
      expect(fee).to.be.eq(BigNumber.from(fees.flatFee).add(5));
      expect(amount).to.be.eq(transferAmount);
    });

    it("should work with only static flat fees where the received amount is exact", async () => {
      fees.gasSubsidyPercentage = 100;
      fees.percentageFee = 0;
      getFeesStub.returns(Result.ok(fees));
      const result = await feesService.calculateFeeAmount(
        transferAmount,
        true,
        fromAssetId,
        fromChannel.networkContext.chainId,
        toAssetId,
        toChannel.networkContext.chainId,
        ethReader as IVectorChainReader,
        routerIdentifier,
        log,
        fromChannel,
        toChannel,
      );
      expect(result.isError).to.be.false;
      const { fee, amount } = result.getValue();
      expect(fee).to.be.eq(BigNumber.from(fees.flatFee));
      expect(amount).to.be.eq(transferAmount.add(fees.flatFee));
    });

    it.skip("should work with static percentage + flat fees where the received amount is exact", async () => {
      fees.gasSubsidyPercentage = 100;
      fees.percentageFee = 10;
      getFeesStub.returns(Result.ok(fees));
      const result = await feesService.calculateFeeAmount(
        transferAmount,
        true,
        fromAssetId,
        fromChannel.networkContext.chainId,
        toAssetId,
        toChannel.networkContext.chainId,
        ethReader as IVectorChainReader,
        routerIdentifier,
        log,
        fromChannel,
        toChannel,
      );
      expect(result.isError).to.be.false;
      const { fee, amount } = result.getValue();
      const expectedFees = BigNumber.from(fees.flatFee).add(transferAmount.mul(11).div(100));
      expect(fee).to.be.eq(expectedFees);
      expect(amount).to.be.eq(transferAmount.add(expectedFees));
    });

    it("should calc fee with non-exact amt and <1% fee", async () => {
      fees.gasSubsidyPercentage = 100;
      fees.percentageFee = 0.1;
      const _transferAmount = BigNumber.from(1000);
      onSwapGivenInStub.resolves(Result.ok({ priceImpact: "0", amountOut: _transferAmount }));
      getFeesStub.returns(Result.ok(fees));
      const result = await feesService.calculateFeeAmount(
        _transferAmount,
        false,
        fromAssetId,
        fromChannel.networkContext.chainId,
        toAssetId,
        toChannel.networkContext.chainId,
        ethReader as IVectorChainReader,
        routerIdentifier,
        log,
        fromChannel,
        toChannel,
      );
      expect(result.isError).to.be.false;
      const { fee, amount } = result.getValue();
      console.log("amount: ", amount.toString());
      console.log("fee: ", fee.toString());
      const expectedFees = BigNumber.from(1).add(fees.flatFee);
      expect(fee).to.be.eq(expectedFees);
      expect(amount).to.be.eq(_transferAmount);
    });

    it.skip("should work with static percentage + flat fees where the received amount is exact (fees are a percent)", async () => {
      transferAmount = parseEther("1");
      fees.gasSubsidyPercentage = 100;
      fees.percentageFee = 0.03;
      getFeesStub.returns(Result.ok(fees));
      const result = await feesService.calculateFeeAmount(
        transferAmount,
        true,
        fromAssetId,
        fromChannel.networkContext.chainId,
        toAssetId,
        toChannel.networkContext.chainId,
        ethReader as IVectorChainReader,
        routerIdentifier,
        log,
        fromChannel,
        toChannel,
      );
      expect(result.isError).to.be.false;
      const { fee, amount } = result.getValue();
      console.log("amount: ", amount.toString());
      console.log("fee: ", fee.toString());
      const highEnd = transferAmount.add(1000);
      const lowEnd = transferAmount.sub(1000);
      expect(amount.sub(fee).gt(lowEnd)).to.be.true;
      expect(amount.sub(fee).lt(highEnd)).to.be.true;
    });

    it("should not apply gas fees if neither from or to chain have chain id = 1", async () => {
      fromChannel.networkContext.chainId = 1427;
      toChannel.networkContext.chainId = 1427;
      getSwappedAmountStub.resolves(Result.ok(0));
      const result = await feesService.calculateFeeAmount(
        transferAmount,
        false,
        fromAssetId,
        fromChannel.networkContext.chainId,
        toAssetId,
        toChannel.networkContext.chainId,
        ethReader as IVectorChainReader,
        routerIdentifier,
        log,
        fromChannel,
        toChannel,
      );
      expect(result.isError).to.be.false;
      const { fee, amount } = result.getValue();
      expect(fee).to.be.eq(BigNumber.from(fees.flatFee).add(5));
      expect(amount).to.be.eq(transferAmount);
    });

    it("should work with only dynamic fees on fromChain", async () => {
      fees.percentageFee = 0;
      fees.flatFee = "0";
      getFeesStub.returns(Result.ok(fees));
      toChannel.networkContext.chainId = 1337;
      getSwappedAmountStub.resolves(Result.ok(0));

      const result = await feesService.calculateFeeAmount(
        transferAmount,
        false,
        fromAssetId,
        fromChannel.networkContext.chainId,
        toAssetId,
        toChannel.networkContext.chainId,
        ethReader as IVectorChainReader,
        routerIdentifier,
        log,
        fromChannel,
        toChannel,
      );
      expect(result.isError).to.be.false;
      const percentage = 100 - fees.gasSubsidyPercentage;
      const dynamicFees = gasFees[0].toNumber() * (percentage / 100);
      const { fee, amount } = result.getValue();
      expect(fee).to.be.eq(BigNumber.from(dynamicFees));
      expect(amount).to.be.eq(transferAmount);
    });

    it("should work with only dynamic fees on toChain", async () => {
      fees.percentageFee = 0;
      fees.flatFee = "0";
      getFeesStub.returns(Result.ok(fees));
      fromChannel.networkContext.chainId = 1427;

      const result = await feesService.calculateFeeAmount(
        transferAmount,
        false,
        fromAssetId,
        fromChannel.networkContext.chainId,
        toAssetId,
        toChannel.networkContext.chainId,
        ethReader as IVectorChainReader,
        routerIdentifier,
        log,
        fromChannel,
        toChannel,
      );
      expect(result.isError).to.be.false;
      const percentage = 100 - fees.gasSubsidyPercentage;
      const dynamicFees = gasFees[1].toNumber() * (percentage / 100);
      const { fee, amount } = result.getValue();
      expect(fee).to.be.eq(BigNumber.from(dynamicFees));
      expect(amount).to.be.eq(transferAmount);
    });

    it("should work with only dynamic fees on fromChain && toChain", async () => {
      fees.percentageFee = 0;
      fees.flatFee = "0";
      getFeesStub.returns(Result.ok(fees));

      const result = await feesService.calculateFeeAmount(
        transferAmount,
        false,
        fromAssetId,
        fromChannel.networkContext.chainId,
        toAssetId,
        toChannel.networkContext.chainId,
        ethReader as IVectorChainReader,
        routerIdentifier,
        log,
        fromChannel,
        toChannel,
      );
      expect(result.isError).to.be.false;
      const percentage = 100 - fees.gasSubsidyPercentage;
      const dynamicFees = gasFees[1].add(gasFees[0]).toNumber() * (percentage / 100);
      const { fee, amount } = result.getValue();
      expect(fee).to.be.eq(BigNumber.from(dynamicFees));
      expect(amount).to.be.eq(transferAmount);
    });

    it("should work with static and dynamic fees", async () => {
      const result = await feesService.calculateFeeAmount(
        transferAmount,
        false,
        fromAssetId,
        fromChannel.networkContext.chainId,
        toAssetId,
        toChannel.networkContext.chainId,
        ethReader as IVectorChainReader,
        routerIdentifier,
        log,
        fromChannel,
        toChannel,
      );
      expect(result.isError).to.be.false;
      const staticFees =
        BigNumber.from(fees.flatFee).toNumber() + (transferAmount.toNumber() * fees.percentageFee) / 100;
      const percentage = 100 - fees.gasSubsidyPercentage;
      const dynamicFees = gasFees[1].add(gasFees[0]).toNumber() * (percentage / 100);
      const { fee, amount } = result.getValue();
      expect(fee).to.be.eq(BigNumber.from(staticFees + dynamicFees));
      expect(amount).to.be.eq(transferAmount);
    });

    it.skip("should work with static and dynamic fees w/an exact received amount", async () => {
      fees.percentageFee = 10;
      const result = await feesService.calculateFeeAmount(
        transferAmount,
        true,
        fromAssetId,
        fromChannel.networkContext.chainId,
        toAssetId,
        toChannel.networkContext.chainId,
        ethReader as IVectorChainReader,
        routerIdentifier,
        log,
        fromChannel,
        toChannel,
      );
      expect(result.isError).to.be.false;
      const percentage = 100 - fees.gasSubsidyPercentage;
      const dynamicFees = gasFees[1].add(gasFees[0]).toNumber() * (percentage / 100);

      const expectedFees = BigNumber.from(fees.flatFee).add(transferAmount.mul(11).div(100)).add(dynamicFees);
      const { fee, amount } = result.getValue();

      expect(fee).to.be.eq(expectedFees);
      expect(amount).to.be.eq(transferAmount.add(expectedFees));
    });

    it("should work if there is no fromChannel", async () => {
      const result = await feesService.calculateFeeAmount(
        transferAmount,
        false,
        fromAssetId,
        fromChannel.networkContext.chainId,
        toAssetId,
        toChannel.networkContext.chainId,
        ethReader as IVectorChainReader,
        routerIdentifier,
        log,
        undefined,
        toChannel,
      );
      expect(result.isError).to.be.false;
      const staticFees =
        BigNumber.from(fees.flatFee).toNumber() + (transferAmount.toNumber() * fees.percentageFee) / 100;
      const percentage = 100 - fees.gasSubsidyPercentage;
      const dynamicFees = gasFees[1].add(gasFees[0]).toNumber() * (percentage / 100);
      const { fee, amount } = result.getValue();
      expect(fee).to.be.eq(BigNumber.from(staticFees + dynamicFees));
      expect(amount).to.be.eq(transferAmount);
    });

    it("should work if there is no toChannel", async () => {
      const result = await feesService.calculateFeeAmount(
        transferAmount,
        false,
        fromAssetId,
        fromChannel.networkContext.chainId,
        toAssetId,
        toChannel.networkContext.chainId,
        ethReader as IVectorChainReader,
        routerIdentifier,
        log,
        fromChannel,
        undefined,
      );
      expect(result.isError).to.be.false;
      const staticFees =
        BigNumber.from(fees.flatFee).toNumber() + (transferAmount.toNumber() * fees.percentageFee) / 100;
      const percentage = 100 - fees.gasSubsidyPercentage;
      const dynamicFees = gasFees[1].add(gasFees[0]).toNumber() * (percentage / 100);
      const { fee, amount } = result.getValue();
      expect(fee).to.be.eq(BigNumber.from(staticFees + dynamicFees));
      expect(amount).to.be.eq(transferAmount);
    });

    it("should work if there is no toChannel or fromChannel", async () => {
      const result = await feesService.calculateFeeAmount(
        transferAmount,
        false,
        fromAssetId,
        fromChannel.networkContext.chainId,
        toAssetId,
        toChannel.networkContext.chainId,
        ethReader as IVectorChainReader,
        routerIdentifier,
        log,
        undefined,
        undefined,
      );
      expect(result.isError).to.be.false;
      const staticFees =
        BigNumber.from(fees.flatFee).toNumber() + (transferAmount.toNumber() * fees.percentageFee) / 100;
      const percentage = 100 - fees.gasSubsidyPercentage;
      const dynamicFees = gasFees[1].add(gasFees[0]).toNumber() * (percentage / 100);
      const { fee, amount } = result.getValue();
      expect(fee).to.be.eq(BigNumber.from(staticFees + dynamicFees));
      expect(amount).to.be.eq(transferAmount);
    });

    it("should fail if it cannot get swap fees from config", async () => {
      getFeesStub.returns(Result.fail(new Error("fail")));
      const result = await feesService.calculateFeeAmount(
        transferAmount,
        false,
        fromAssetId,
        fromChannel.networkContext.chainId,
        toAssetId,
        toChannel.networkContext.chainId,
        ethReader as IVectorChainReader,
        routerIdentifier,
        log,
        fromChannel,
        toChannel,
      );
      expect(result.isError).to.be.true;
      expect(result.getError()?.message).to.be.eq(FeeError.reasons.ConfigError);
      expect(result.getError()?.context.getFeesError).to.be.ok;
    });

    it("should fail if it cannot calculate estimated gas fees", async () => {
      calculateEstimatedGasFeeStub.returns(Result.fail(new Error("fail")));
      const result = await feesService.calculateFeeAmount(
        transferAmount,
        false,
        fromAssetId,
        fromChannel.networkContext.chainId,
        toAssetId,
        toChannel.networkContext.chainId,
        ethReader as IVectorChainReader,
        routerIdentifier,
        log,
        fromChannel,
        toChannel,
      );
      expect(result.isError).to.be.true;
      expect(result.getError()?.message).to.be.eq("fail");
    });

    it("should fail if it cannot get normalized toChannel fees", async () => {
      normalizedGasFeesStub.onSecondCall().returns(Result.fail(new Error("fail")));
      const result = await feesService.calculateFeeAmount(
        transferAmount,
        false,
        fromAssetId,
        fromChannel.networkContext.chainId,
        toAssetId,
        toChannel.networkContext.chainId,
        ethReader as IVectorChainReader,
        routerIdentifier,
        log,
        fromChannel,
        toChannel,
      );
      expect(result.isError).to.be.true;
      expect(result.getError()?.message).to.be.eq(FeeError.reasons.ExchangeRateError);
      expect(result.getError()?.context.message).to.be.eq("Could not normalize fees");
    });

    it("should fail if it cannot get normalized fromChannel fees", async () => {
      normalizedGasFeesStub.onFirstCall().returns(Result.fail(new Error("fail")));
      const result = await feesService.calculateFeeAmount(
        transferAmount,
        false,
        fromAssetId,
        fromChannel.networkContext.chainId,
        toAssetId,
        toChannel.networkContext.chainId,
        ethReader as IVectorChainReader,
        routerIdentifier,
        log,
        fromChannel,
        toChannel,
      );
      expect(result.isError).to.be.true;
      expect(result.getError()?.message).to.be.eq(FeeError.reasons.ExchangeRateError);
      expect(result.getError()?.context.message).to.be.eq("Could not normalize fees");
    });
  });

  describe("feesService.calculateEstimatedGasFee", () => {
    let toSend: BigNumber;
    let routerIdentifier: string;
    let toAssetId: string;
    let fromAssetId: string;
    let toChannel: FullChannelState;
    let fromChannel: FullChannelState;

    beforeEach(() => {
      toSend = BigNumber.from(100);
      routerIdentifier = vectorUtils.getRandomChannelSigner().publicIdentifier;
      toAssetId = vectorUtils.mkAddress("0xaaa");
      fromAssetId = vectorUtils.mkAddress("0xffff");
      toChannel = vectorUtils.createTestChannelState(UpdateType.deposit, {
        channelAddress: vectorUtils.mkAddress("0xaaa"),
        aliceIdentifier: routerIdentifier,
        assetIds: [toAssetId],
      }).channel;
      fromChannel = vectorUtils.createTestChannelState(UpdateType.deposit, {
        channelAddress: vectorUtils.mkAddress("0xbbb"),
        aliceIdentifier: routerIdentifier,
        assetIds: [fromAssetId],
      }).channel;

      // Stubs
      ethReader.getCode.onFirstCall().resolves(Result.ok(vectorUtils.getRandomBytes32()));
      ethReader.getCode.onSecondCall().resolves(Result.ok(vectorUtils.getRandomBytes32()));
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
      fromChannel.aliceIdentifier = vectorUtils.getRandomChannelSigner().publicIdentifier;
      const result = await feesService.calculateEstimatedGasFee(
        toSend,
        fromAssetId,
        fromChannel.networkContext.chainId,
        toAssetId,
        toChannel.networkContext.chainId,
        ethReader as IVectorChainReader,
        routerIdentifier,
        log,
        fromChannel,
        toChannel,
      );
      expect(result.isError).to.be.true;
      expect(result.getError()?.message).to.be.eq(FeeError.reasons.ChannelError);
      expect(result.getError()?.context.message).to.be.eq("Not in channel");
    });

    it("should fail if cannot get code at from channel", async () => {
      ethReader.getCode.onFirstCall().resolves(Result.fail(new Error("fail")) as any);
      const result = await feesService.calculateEstimatedGasFee(
        toSend,
        fromAssetId,
        fromChannel.networkContext.chainId,
        toAssetId,
        toChannel.networkContext.chainId,
        ethReader as IVectorChainReader,
        routerIdentifier,
        log,
        fromChannel,
        toChannel,
      );
      expect(result.isError).to.be.true;
      expect(result.getError()?.message).to.be.eq(FeeError.reasons.ChainError);
      expect(result.getError()?.context.getCodeError).to.be.ok;
    });

    it("should fail if cannot get rebalance profile for fromAsset", async () => {
      getRebalanceProfileStub.returns(Result.fail(new Error("fail")));
      const result = await feesService.calculateEstimatedGasFee(
        toSend,
        fromAssetId,
        fromChannel.networkContext.chainId,
        toAssetId,
        toChannel.networkContext.chainId,
        ethReader as IVectorChainReader,
        routerIdentifier,
        log,
        fromChannel,
        toChannel,
      );
      expect(result.isError).to.be.true;
      expect(result.getError()?.message).to.be.eq(FeeError.reasons.ConfigError);
      expect(result.getError()?.context.message).to.be.eq("Failed to get rebalance profile");
    });

    it("should fail if router is not in toChannel", async () => {
      toChannel.aliceIdentifier = vectorUtils.getRandomChannelSigner().publicIdentifier;
      const result = await feesService.calculateEstimatedGasFee(
        toSend,
        fromAssetId,
        fromChannel.networkContext.chainId,
        toAssetId,
        toChannel.networkContext.chainId,
        ethReader as IVectorChainReader,
        routerIdentifier,
        log,
        fromChannel,
        toChannel,
      );
      expect(result.isError).to.be.true;
      expect(result.getError()?.message).to.be.eq(FeeError.reasons.ChannelError);
      expect(result.getError()?.context.message).to.be.eq("Not in channel");
    });

    it("should fail if cannot get swapped amount", async () => {
      getSwappedAmountStub.resolves(Result.fail(new Error("fail")) as any);
      const result = await feesService.calculateEstimatedGasFee(
        toSend,
        fromAssetId,
        fromChannel.networkContext.chainId,
        toAssetId,
        toChannel.networkContext.chainId,
        ethReader as IVectorChainReader,
        routerIdentifier,
        log,
        fromChannel,
        toChannel,
      );
      expect(result.isError).to.be.true;
      expect(result.getError()?.message).to.be.eq(FeeError.reasons.ConversionError);
      expect(result.getError()?.context.swapError).to.be.ok;
    });

    it("should fail if cannot get code at toChannel", async () => {
      ethReader.getCode.onSecondCall().resolves(Result.fail(new Error("fail")) as any);
      const result = await feesService.calculateEstimatedGasFee(
        toSend,
        fromAssetId,
        fromChannel.networkContext.chainId,
        toAssetId,
        toChannel.networkContext.chainId,
        ethReader as IVectorChainReader,
        routerIdentifier,
        log,
        fromChannel,
        toChannel,
      );
      expect(result.isError).to.be.true;
      expect(result.getError()?.message).to.be.eq(FeeError.reasons.ChainError);
      expect(result.getError()?.context.getCodeError).to.be.ok;
    });

    describe("should work for fromChannel actions", () => {
      it("should work if from channel will reclaim && channel is not deployed", async () => {
        ethReader.getCode.onFirstCall().resolves(Result.ok("0x"));
        fromChannel.balances[0] = { to: [fromChannel.alice, fromChannel.bob], amount: ["780", "0"] };
        const result = await feesService.calculateEstimatedGasFee(
          toSend,
          fromAssetId,
          fromChannel.networkContext.chainId,
          toAssetId,
          toChannel.networkContext.chainId,
          ethReader as IVectorChainReader,
          routerIdentifier,
          log,
          fromChannel,
          toChannel,
        );
        expect(result.isError).to.be.false;
        expect(result.getValue()[0]).to.be.eq(GAS_ESTIMATES.createChannel.add(SIMPLE_WITHDRAWAL_GAS_ESTIMATE));
      });

      it("should work if from channel will reclaim && channel is deployed", async () => {
        fromChannel.balances[0] = { to: [fromChannel.alice, fromChannel.bob], amount: ["780", "0"] };
        const result = await feesService.calculateEstimatedGasFee(
          toSend,
          fromAssetId,
          fromChannel.networkContext.chainId,
          toAssetId,
          toChannel.networkContext.chainId,
          ethReader as IVectorChainReader,
          routerIdentifier,
          log,
          fromChannel,
          toChannel,
        );
        expect(result.isError).to.be.false;
        expect(result.getValue()[0]).to.be.eq(SIMPLE_WITHDRAWAL_GAS_ESTIMATE);
      });

      it("should work if from channel will collateralize && router is bob", async () => {
        fromChannel.balances[0] = {
          to: [fromChannel.bob, fromChannel.alice],
          amount: ["0", "0"],
        };
        fromChannel.aliceIdentifier = fromChannel.bobIdentifier;
        fromChannel.bobIdentifier = routerIdentifier;

        // setup gas fees stubs
        // from channel calls
        const result = await feesService.calculateEstimatedGasFee(
          BigNumber.from(3),
          fromAssetId,
          fromChannel.networkContext.chainId,
          toAssetId,
          toChannel.networkContext.chainId,
          ethReader as IVectorChainReader,
          routerIdentifier,
          log,
          fromChannel,
          toChannel,
        );
        expect(result.isError).to.be.false;
        expect(result.getValue()[0]).to.be.eq(GAS_ESTIMATES.depositBob);
      });

      it("should work if from channel will collateralize && router is alice && channel is not deployed", async () => {
        ethReader.getCode.onFirstCall().resolves(Result.ok("0x"));
        fromChannel.balances[0] = {
          to: [fromChannel.alice, fromChannel.bob],
          amount: ["0", "0"],
        };
        const result = await feesService.calculateEstimatedGasFee(
          BigNumber.from(3),
          fromAssetId,
          fromChannel.networkContext.chainId,
          toAssetId,
          toChannel.networkContext.chainId,
          ethReader as IVectorChainReader,
          routerIdentifier,
          log,
          fromChannel,
          toChannel,
        );
        expect(result.isError).to.be.false;
        expect(result.getValue()[0]).to.be.eq(GAS_ESTIMATES.createChannelAndDepositAlice);
      });

      it("should work if from channel will collateralize && router is alice && channel is deployed", async () => {
        fromChannel.balances[0] = {
          to: [fromChannel.alice, fromChannel.bob],
          amount: ["0", "0"],
        };
        const result = await feesService.calculateEstimatedGasFee(
          BigNumber.from(3),
          fromAssetId,
          fromChannel.networkContext.chainId,
          toAssetId,
          toChannel.networkContext.chainId,
          ethReader as IVectorChainReader,
          routerIdentifier,
          log,
          fromChannel,
          toChannel,
        );
        expect(result.isError).to.be.false;
        expect(result.getValue()[0]).to.be.eq(GAS_ESTIMATES.depositAlice);
      });

      it("should work if no fromChannel and will collateralize", async () => {
        fromChannel.balances[0] = {
          to: [fromChannel.alice, fromChannel.bob],
          amount: ["0", "0"],
        };
        const result = await feesService.calculateEstimatedGasFee(
          BigNumber.from(3),
          fromAssetId,
          fromChannel.networkContext.chainId,
          toAssetId,
          toChannel.networkContext.chainId,
          ethReader as IVectorChainReader,
          routerIdentifier,
          log,
          undefined,
          toChannel,
        );
        expect(result.isError).to.be.false;
        expect(result.getValue()[0]).to.be.eq(GAS_ESTIMATES.createChannelAndDepositAlice);
      });

      it("should work if no fromChannel and will reclaim", async () => {
        const result = await feesService.calculateEstimatedGasFee(
          BigNumber.from(101),
          fromAssetId,
          fromChannel.networkContext.chainId,
          toAssetId,
          toChannel.networkContext.chainId,
          ethReader as IVectorChainReader,
          routerIdentifier,
          log,
          undefined,
          toChannel,
        );
        expect(result.isError).to.be.false;
        expect(result.getValue()[0]).to.be.eq(GAS_ESTIMATES.createChannel.add(SIMPLE_WITHDRAWAL_GAS_ESTIMATE));
      });

      it("should work if no fromChannel and will collateralize", async () => {
        const result = await feesService.calculateEstimatedGasFee(
          BigNumber.from(3),
          fromAssetId,
          fromChannel.networkContext.chainId,
          toAssetId,
          toChannel.networkContext.chainId,
          ethReader as IVectorChainReader,
          routerIdentifier,
          log,
          undefined,
          toChannel,
        );
        expect(result.isError).to.be.false;
        expect(result.getValue()[0]).to.be.eq(GAS_ESTIMATES.createChannelAndDepositAlice);
      });
    });

    describe("should work for toChannel actions", () => {
      it("should work if to channel will do nothing", async () => {
        toChannel.balances[0] = { to: [toChannel.alice, toChannel.bob], amount: ["301", "0"] };
        const result = await feesService.calculateEstimatedGasFee(
          One,
          fromAssetId,
          fromChannel.networkContext.chainId,
          toAssetId,
          toChannel.networkContext.chainId,
          ethReader as IVectorChainReader,
          routerIdentifier,
          log,
          fromChannel,
          toChannel,
        );
        expect(result.isError).to.be.false;
        expect(result.getValue()[1]).to.be.eq(0);
      });

      it("should work if to channel will reclaim", async () => {
        toChannel.balances[0] = { to: [toChannel.alice, toChannel.bob], amount: ["780", "0"] };
        const result = await feesService.calculateEstimatedGasFee(
          One,
          fromAssetId,
          fromChannel.networkContext.chainId,
          toAssetId,
          toChannel.networkContext.chainId,
          ethReader as IVectorChainReader,
          routerIdentifier,
          log,
          fromChannel,
          toChannel,
        );
        expect(result.isError).to.be.false;
        expect(result.getValue()[1]).to.be.eq(GAS_ESTIMATES.withdraw);
      });

      it("should work if to channel will collatearlize && router is bob", async () => {
        toChannel.balances[0] = { to: [toChannel.bob, toChannel.alice], amount: ["0", "0"] };
        toChannel.aliceIdentifier = toChannel.bobIdentifier;
        toChannel.bobIdentifier = routerIdentifier;

        // setup gas for to channel calls

        const result = await feesService.calculateEstimatedGasFee(
          toSend,
          fromAssetId,
          fromChannel.networkContext.chainId,
          toAssetId,
          toChannel.networkContext.chainId,
          ethReader as IVectorChainReader,
          routerIdentifier,
          log,
          fromChannel,
          toChannel,
        );
        expect(result.isError).to.be.false;
        expect(result.getValue()[1]).to.be.eq(GAS_ESTIMATES.depositBob);
      });

      it("should work if to channel will collateralize && router is alice && channel is not deployed", async () => {
        ethReader.getCode.onSecondCall().resolves(Result.ok("0x"));
        toChannel.balances[0] = { to: [toChannel.alice, toChannel.bob], amount: ["0", "0"] };

        const result = await feesService.calculateEstimatedGasFee(
          toSend,
          fromAssetId,
          fromChannel.networkContext.chainId,
          toAssetId,
          toChannel.networkContext.chainId,
          ethReader as IVectorChainReader,
          routerIdentifier,
          log,
          fromChannel,
          toChannel,
        );
        expect(result.isError).to.be.false;
        expect(result.getValue()[1]).to.be.eq(GAS_ESTIMATES.createChannelAndDepositAlice);
      });

      it("should work if to channel will collateralize && router is alice && channel is deployed", async () => {
        toChannel.balances[0] = { to: [toChannel.alice, toChannel.bob], amount: ["0", "0"] };

        const result = await feesService.calculateEstimatedGasFee(
          toSend,
          fromAssetId,
          fromChannel.networkContext.chainId,
          toAssetId,
          toChannel.networkContext.chainId,
          ethReader as IVectorChainReader,
          routerIdentifier,
          log,
          fromChannel,
          toChannel,
        );
        expect(result.isError).to.be.false;
        expect(result.getValue()[1]).to.be.eq(GAS_ESTIMATES.depositAlice);
      });

      it("should work if no toChannel and will collateralize", async () => {
        const result = await feesService.calculateEstimatedGasFee(
          toSend,
          fromAssetId,
          fromChannel.networkContext.chainId,
          toAssetId,
          toChannel.networkContext.chainId,
          ethReader as IVectorChainReader,
          routerIdentifier,
          log,
          fromChannel,
          undefined,
        );
        expect(result.isError).to.be.false;
        expect(result.getValue()[1]).to.be.eq(GAS_ESTIMATES.createChannelAndDepositAlice);
      });

      it("should work if no toChannel and will reclaim", async () => {
        const result = await feesService.calculateEstimatedGasFee(
          toSend,
          fromAssetId,
          fromChannel.networkContext.chainId,
          toAssetId,
          toChannel.networkContext.chainId,
          ethReader as IVectorChainReader,
          routerIdentifier,
          log,
          fromChannel,
          undefined,
        );
        expect(result.isError).to.be.false;
        expect(result.getValue()[1]).to.be.eq(GAS_ESTIMATES.createChannelAndDepositAlice);
      });
    });

    it("should work if no toChannel or fromChannel and sendAmount lte ", async () => {
      const result = await feesService.calculateEstimatedGasFee(
        toSend,
        fromAssetId,
        fromChannel.networkContext.chainId,
        toAssetId,
        toChannel.networkContext.chainId,
        ethReader as IVectorChainReader,
        routerIdentifier,
        log,
        undefined,
        undefined,
      );
      expect(result.isError).to.be.false;
      expect(result.getValue()[0]).to.be.eq(Zero);
      expect(result.getValue()[1]).to.be.eq(GAS_ESTIMATES.createChannelAndDepositAlice);
    });
  });
});
