import { VectorChainReader } from "@connext/vector-contracts";
import * as vectorUtils from "@connext/vector-utils";
import { Result, UpdateType, FullChannelState, GAS_ESTIMATES } from "@connext/vector-types";
import { BigNumber } from "@ethersproject/bignumber";
import { expect } from "chai";
import Sinon from "sinon";

import { getConfig } from "../../config";
import * as swapService from "../../services/swap";
import * as configService from "../../services/config";
import { FeeError } from "../../errors";
import * as feesService from "../../services/fees";

const config = getConfig();

const testName = "Router fees";
const { log } = vectorUtils.getTestLoggers(testName, config.logLevel ?? ("info" as any));

describe(testName, () => {
  let ethReader: Sinon.SinonStubbedInstance<VectorChainReader>;
  let getRebalanceProfileStub: Sinon.SinonStub;
  let getSwappedAmountStub: Sinon.SinonStub;
  let getFeesStub: Sinon.SinonStub;

  beforeEach(async () => {
    ethReader = Sinon.createStubInstance(VectorChainReader);
    getRebalanceProfileStub = Sinon.stub(configService, "getRebalanceProfile");
    getSwappedAmountStub = Sinon.stub(swapService, "getSwappedAmount");
    getFeesStub = Sinon.stub(configService, "getSwapFees");
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
    let gasFees: { [channelAddress: string]: BigNumber };

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
      gasFees = {
        [fromChannel.channelAddress]: BigNumber.from(50),
        [toChannel.channelAddress]: BigNumber.from(25),
      };

      // default stubs
      getFeesStub.returns(Result.ok(fees));
      calculateEstimatedGasFeeStub = Sinon.stub(feesService, "calculateEstimatedGasFee");
      calculateEstimatedGasFeeStub.resolves(Result.ok(gasFees));

      // by default, these functions should only return gas fee values
      // i.e. they do nothing
      normalizedGasFeesStub = Sinon.stub(vectorUtils, "normalizeFee");
      normalizedGasFeesStub.resolves(Result.ok(gasFees[fromChannel.channelAddress]));
      normalizedGasFeesStub.onSecondCall().resolves(Result.ok(gasFees[toChannel.channelAddress]));
      getSwappedAmountStub.resolves(Result.ok(gasFees[toChannel.channelAddress]));
    });

    it("should work with only static fees", async () => {
      fees.gasSubsidyPercentage = 100;
      getFeesStub.returns(Result.ok(fees));
      const result = await feesService.calculateFeeAmount(
        transferAmount,
        fromAssetId,
        fromChannel,
        toAssetId,
        toChannel,
        ethReader,
        routerIdentifier,
        log,
      );
      expect(result.isError).to.be.false;
      expect(result.getValue()).to.be.eq(BigNumber.from(fees.flatFee).add(5));
    });

    it("should not apply gas fees if neither from or to chain have chain id = 1", async () => {
      fromChannel.networkContext.chainId = 1337;
      toChannel.networkContext.chainId = 1337;
      getSwappedAmountStub.resolves(Result.ok(0));
      const result = await feesService.calculateFeeAmount(
        transferAmount,
        fromAssetId,
        fromChannel,
        toAssetId,
        toChannel,
        ethReader,
        routerIdentifier,
        log,
      );
      expect(result.isError).to.be.false;
      expect(result.getValue()).to.be.eq(BigNumber.from(fees.flatFee).add(5));
    });

    it("should work with only dynamic fees on fromChain", async () => {
      fees.percentageFee = 0;
      fees.flatFee = "0";
      getFeesStub.returns(Result.ok(fees));
      toChannel.networkContext.chainId = 1337;
      getSwappedAmountStub.resolves(Result.ok(0));

      const result = await feesService.calculateFeeAmount(
        transferAmount,
        fromAssetId,
        fromChannel,
        toAssetId,
        toChannel,
        ethReader,
        routerIdentifier,
        log,
      );
      expect(result.isError).to.be.false;
      const percentage = 100 - fees.gasSubsidyPercentage;
      const dynamicFees = gasFees[fromChannel.channelAddress].toNumber() * (percentage / 100);
      expect(result.getValue().toNumber()).to.be.eq(dynamicFees);
    });

    it("should work with only dynamic fees on toChain", async () => {
      fees.percentageFee = 0;
      fees.flatFee = "0";
      getFeesStub.returns(Result.ok(fees));
      fromChannel.networkContext.chainId = 1337;

      const result = await feesService.calculateFeeAmount(
        transferAmount,
        fromAssetId,
        fromChannel,
        toAssetId,
        toChannel,
        ethReader,
        routerIdentifier,
        log,
      );
      expect(result.isError).to.be.false;
      const percentage = 100 - fees.gasSubsidyPercentage;
      const dynamicFees = gasFees[toChannel.channelAddress].toNumber() * (percentage / 100);
      expect(result.getValue().toNumber()).to.be.eq(dynamicFees);
    });

    it("should work with only dynamic fees on fromChain && toChain", async () => {
      fees.percentageFee = 0;
      fees.flatFee = "0";
      getFeesStub.returns(Result.ok(fees));

      const result = await feesService.calculateFeeAmount(
        transferAmount,
        fromAssetId,
        fromChannel,
        toAssetId,
        toChannel,
        ethReader,
        routerIdentifier,
        log,
      );
      expect(result.isError).to.be.false;
      const percentage = 100 - fees.gasSubsidyPercentage;
      const dynamicFees =
        gasFees[toChannel.channelAddress].add(gasFees[fromChannel.channelAddress]).toNumber() * (percentage / 100);
      expect(result.getValue().toNumber()).to.be.eq(dynamicFees);
    });

    it("should work with static and dynamic fees", async () => {
      const result = await feesService.calculateFeeAmount(
        transferAmount,
        fromAssetId,
        fromChannel,
        toAssetId,
        toChannel,
        ethReader,
        routerIdentifier,
        log,
      );
      expect(result.isError).to.be.false;
      const staticFees =
        BigNumber.from(fees.flatFee).toNumber() + (transferAmount.toNumber() * fees.percentageFee) / 100;
      const percentage = 100 - fees.gasSubsidyPercentage;
      const dynamicFees =
        gasFees[toChannel.channelAddress].add(gasFees[fromChannel.channelAddress]).toNumber() * (percentage / 100);
      expect(result.getValue().toNumber()).to.be.eq(staticFees + dynamicFees);
    });

    it("should fail if it cannot get swap fees from config", async () => {
      getFeesStub.returns(Result.fail(new Error("fail")));
      const result = await feesService.calculateFeeAmount(
        transferAmount,
        fromAssetId,
        fromChannel,
        toAssetId,
        toChannel,
        ethReader,
        routerIdentifier,
        log,
      );
      expect(result.isError).to.be.true;
      expect(result.getError()?.message).to.be.eq(FeeError.reasons.ConfigError);
      expect(result.getError()?.context.getFeesError).to.be.ok;
    });

    it("should fail if it cannot calculate estimated gas fees", async () => {
      calculateEstimatedGasFeeStub.returns(Result.fail(new Error("fail")));
      const result = await feesService.calculateFeeAmount(
        transferAmount,
        fromAssetId,
        fromChannel,
        toAssetId,
        toChannel,
        ethReader,
        routerIdentifier,
        log,
      );
      expect(result.isError).to.be.true;
      expect(result.getError()?.message).to.be.eq("fail");
    });

    it("should fail if it cannot get normalized toChannel fees", async () => {
      normalizedGasFeesStub.onSecondCall().returns(Result.fail(new Error("fail")));
      const result = await feesService.calculateFeeAmount(
        transferAmount,
        fromAssetId,
        fromChannel,
        toAssetId,
        toChannel,
        ethReader,
        routerIdentifier,
        log,
      );
      expect(result.isError).to.be.true;
      expect(result.getError()?.message).to.be.eq(FeeError.reasons.ExchangeRateError);
      expect(result.getError()?.context.message).to.be.eq("Could not normalize fees");
    });

    it("should fail if it cannot get normalized fromChannel fees", async () => {
      normalizedGasFeesStub.onFirstCall().returns(Result.fail(new Error("fail")));
      const result = await feesService.calculateFeeAmount(
        transferAmount,
        fromAssetId,
        fromChannel,
        toAssetId,
        toChannel,
        ethReader,
        routerIdentifier,
        log,
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
      const result = await feesService.calculateEstimatedGasFee(
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
      const result = await feesService.calculateEstimatedGasFee(
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
      toChannel.aliceIdentifier = vectorUtils.getRandomChannelSigner().publicIdentifier;
      const result = await feesService.calculateEstimatedGasFee(
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
      const result = await feesService.calculateEstimatedGasFee(
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
      const result = await feesService.calculateEstimatedGasFee(
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
        const result = await feesService.calculateEstimatedGasFee(
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
        const result = await feesService.calculateEstimatedGasFee(
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
        const result = await feesService.calculateEstimatedGasFee(
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
        const result = await feesService.calculateEstimatedGasFee(
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
        const result = await feesService.calculateEstimatedGasFee(
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
        const result = await feesService.calculateEstimatedGasFee(
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

        const result = await feesService.calculateEstimatedGasFee(
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

        const result = await feesService.calculateEstimatedGasFee(
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

        const result = await feesService.calculateEstimatedGasFee(
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
});
