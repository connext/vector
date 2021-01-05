import { VectorChainReader } from "@connext/vector-contracts";
import {
  createTestChannelState,
  expect,
  getRandomBytes32,
  mkAddress,
  RestServerNodeService,
  mkPublicIdentifier,
  getTestLoggers,
} from "@connext/vector-utils";
import Sinon from "sinon";
import { BigNumber } from "@ethersproject/bignumber";
import { AddressZero } from "@ethersproject/constants";
import { INodeService, Result, UpdateType } from "@connext/vector-types";
import { parseEther } from "@ethersproject/units";

import { config } from "../config";
import { adjustCollateral, justInTimeCollateral, requestCollateral } from "../services/collateral";
import * as configService from "../services/config";
import { CollateralError } from "../errors";

const testName = "Collateral";
const { log } = getTestLoggers(testName, config.logLevel as any);
const chainId = parseInt(Object.keys(config.chainProviders)[0]);

describe(testName, () => {
  let node: Sinon.SinonStubbedInstance<RestServerNodeService>;
  let chainReader: Sinon.SinonStubbedInstance<VectorChainReader>;
  let getRebalanceProfile: Sinon.SinonStub;

  const ethProfile = config.rebalanceProfiles.find((p) => p.chainId === chainId && p.assetId === AddressZero);
  const routerPublicIdentifier = mkPublicIdentifier("vectorRRR");

  beforeEach(async () => {
    node = Sinon.createStubInstance(RestServerNodeService);
    node.conditionalTransfer.resolves(Result.ok({} as any));
    node.sendDepositTx.resolves(Result.ok({ txHash: getRandomBytes32() }));
    node.reconcileDeposit.resolves(Result.ok({ channelAddress: mkAddress() }));

    chainReader = Sinon.createStubInstance(VectorChainReader);
    chainReader.getTotalDepositedA.resolves(Result.ok(BigNumber.from(0)));
    chainReader.getTotalDepositedB.resolves(Result.ok(BigNumber.from(0)));
    chainReader.getHydratedProviders.returns(
      Result.ok({
        [1337]: { waitForTransaction: () => Promise.resolve({ logs: [] }) } as any,
      }),
    );

    getRebalanceProfile = Sinon.stub(configService, "getRebalanceProfile");
    getRebalanceProfile.returns(Result.ok(ethProfile));
  });

  afterEach(() => {
    Sinon.restore();
    Sinon.reset();
  });

  describe("justInTimeCollateral", () => {
    const transferAmount = parseEther("0.001");

    it("should do nothing if there is sufficient balance for payment", async () => {
      const { channel } = createTestChannelState(UpdateType.deposit, {
        alice: mkAddress("0xaaa"),
        aliceIdentifier: routerPublicIdentifier,
        assetIds: [AddressZero],
        balances: [{ to: [mkAddress("0xaaa"), mkAddress("0xbbb")], amount: [transferAmount.mul(3).toString(), "0"] }],
      });
      const res = await justInTimeCollateral(
        channel,
        AddressZero,
        routerPublicIdentifier,
        node as INodeService,
        chainReader,
        log,
        transferAmount.toString(),
      );
      expect(res.getError()).to.be.undefined;
      expect(res.getValue()).to.be.undefined;
      expect(node.sendDepositTx.callCount).to.be.eq(0);
    });

    it("should fail if it cannot get the collateral profile", async () => {
      getRebalanceProfile.returns(Result.fail(new Error("fail")));
      const { channel } = createTestChannelState(UpdateType.deposit);
      const res = await justInTimeCollateral(
        channel,
        AddressZero,
        routerPublicIdentifier,
        node as INodeService,
        chainReader,
        log,
        transferAmount.toString(),
      );
      expect(res.getError().message).to.be.eq(CollateralError.reasons.UnableToGetRebalanceProfile);
      expect(node.sendDepositTx.callCount).to.be.eq(0);
    });

    it("should properly request collateral to cover payment", async () => {
      const { channel } = createTestChannelState(UpdateType.deposit, {
        alice: mkAddress("0xaaa"),
        aliceIdentifier: routerPublicIdentifier,
        assetIds: [AddressZero],
        balances: [{ to: [mkAddress("0xaaa"), mkAddress("0xbbb")], amount: ["0", "0"] }],
      });
      const res = await justInTimeCollateral(
        channel,
        AddressZero,
        routerPublicIdentifier,
        node as INodeService,
        chainReader,
        log,
        transferAmount.toString(),
      );
      expect(res.getError()).to.be.undefined;
      expect(res.getValue().channelAddress).to.be.ok;
      expect(node.sendDepositTx.callCount).to.be.eq(1);
      expect(node.sendDepositTx.firstCall.args[0]).to.be.deep.eq({
        channelAddress: channel.channelAddress,
        publicIdentifier: routerPublicIdentifier,
        assetId: AddressZero,
        chainId: channel.networkContext.chainId,
        amount: transferAmount.add(ethProfile.target).toString(),
      });
    });

    it("should request the amount of the payment if the profile.target is 0", async () => {
      const { channel } = createTestChannelState(UpdateType.deposit, {
        alice: mkAddress("0xaaa"),
        aliceIdentifier: routerPublicIdentifier,
        assetIds: [AddressZero],
        balances: [{ to: [mkAddress("0xaaa"), mkAddress("0xbbb")], amount: ["0", "0"] }],
      });
      const profile = { ...ethProfile, target: "0" };
      getRebalanceProfile.returns(Result.ok(profile));

      const res = await justInTimeCollateral(
        channel,
        AddressZero,
        routerPublicIdentifier,
        node as INodeService,
        chainReader,
        log,
        transferAmount.toString(),
      );
      expect(res.getError()).to.be.undefined;
      expect(res.getValue().channelAddress).to.be.ok;
      expect(node.sendDepositTx.callCount).to.be.eq(1);
      expect(node.sendDepositTx.firstCall.args[0]).to.be.deep.eq({
        channelAddress: channel.channelAddress,
        publicIdentifier: routerPublicIdentifier,
        assetId: AddressZero,
        chainId: channel.networkContext.chainId,
        amount: transferAmount.toString(),
      });
    });
  });

  describe("adjustCollateral", () => {
    it("should do nothing if collateralThreshold < channelBalance < reclaimThreshold", async () => {
      const { channel } = createTestChannelState(UpdateType.deposit, {
        alice: mkAddress("0xaaa"),
        aliceIdentifier: routerPublicIdentifier,
        assetIds: [AddressZero],
        balances: [{ to: [mkAddress("0xaaa"), mkAddress("0xbbb")], amount: [ethProfile.target.toString(), "0"] }],
      });
      node.getStateChannel.resolves(Result.ok(channel));
      const res = await adjustCollateral(
        channel.channelAddress,
        AddressZero,
        routerPublicIdentifier,
        node as INodeService,
        chainReader,
        log,
      );
      expect(res.getError()).to.be.undefined;
      expect(res.getValue()).to.be.undefined;
      expect(node.sendDepositTx.callCount).to.be.eq(0);
      expect(node.withdraw.callCount).to.be.eq(0);
    });

    it("should requestCollateral if channelBalance <= collateralizeThreshold", async () => {
      const { channel } = createTestChannelState(UpdateType.deposit, {
        alice: mkAddress("0xaaa"),
        aliceIdentifier: routerPublicIdentifier,
        assetIds: [AddressZero],
        balances: [{ to: [mkAddress("0xaaa"), mkAddress("0xbbb")], amount: ["0", "0"] }],
      });
      node.getStateChannel.resolves(Result.ok(channel));
      const res = await adjustCollateral(
        channel.channelAddress,
        AddressZero,
        routerPublicIdentifier,
        node as INodeService,
        chainReader,
        log,
      );
      expect(res.getError()).to.be.undefined;
      expect(res.getValue().channelAddress).to.be.ok;
      expect(node.sendDepositTx.callCount).to.be.eq(1);
      expect(node.withdraw.callCount).to.be.eq(0);
      expect(node.sendDepositTx.firstCall.args[0]).to.be.deep.eq({
        channelAddress: channel.channelAddress,
        publicIdentifier: routerPublicIdentifier,
        assetId: AddressZero,
        chainId: channel.networkContext.chainId,
        amount: ethProfile.target,
      });
    });

    it("should reclaim if channelBalance >= reclaimThreshold", async () => {
      const routerBalance = BigNumber.from(ethProfile.reclaimThreshold).mul(2);
      const { channel } = createTestChannelState(UpdateType.deposit, {
        alice: mkAddress("0xaaa"),
        aliceIdentifier: routerPublicIdentifier,
        assetIds: [AddressZero],
        balances: [
          {
            to: [mkAddress("0xaaa"), mkAddress("0xbbb")],
            amount: [routerBalance.toString(), "0"],
          },
        ],
      });
      node.getStateChannel.resolves(Result.ok(channel));
      node.withdraw.resolves(Result.ok({ channelAddress: channel.channelAddress, transferId: getRandomBytes32() }));
      const res = await adjustCollateral(
        channel.channelAddress,
        AddressZero,
        routerPublicIdentifier,
        node as INodeService,
        chainReader,
        log,
      );
      expect(res.getError()).to.be.undefined;
      expect(res.getValue().channelAddress).to.be.ok;
      expect(node.sendDepositTx.callCount).to.be.eq(0);
      expect(node.withdraw.callCount).to.be.eq(1);
      expect(node.withdraw.firstCall.args[0]).to.be.deep.eq({
        channelAddress: channel.channelAddress,
        publicIdentifier: routerPublicIdentifier,
        assetId: AddressZero,
        amount: routerBalance.sub(ethProfile.target).toString(),
        recipient: channel.alice,
      });
    });

    it("should fail if reclaiming fails", async () => {
      const routerBalance = BigNumber.from(ethProfile.reclaimThreshold).mul(2);
      const { channel } = createTestChannelState(UpdateType.deposit, {
        alice: mkAddress("0xaaa"),
        aliceIdentifier: routerPublicIdentifier,
        assetIds: [AddressZero],
        balances: [
          {
            to: [mkAddress("0xaaa"), mkAddress("0xbbb")],
            amount: [routerBalance.toString(), "0"],
          },
        ],
      });
      node.getStateChannel.resolves(Result.ok(channel));
      node.withdraw.resolves(Result.fail(new Error("fail") as any));
      const res = await adjustCollateral(
        channel.channelAddress,
        AddressZero,
        routerPublicIdentifier,
        node as INodeService,
        chainReader,
        log,
      );
      expect(res.getError().message).to.be.eq(CollateralError.reasons.UnableToReclaim);
      expect(res.getError().context).to.be.deep.eq({
        assetId: AddressZero,
        channelAddress: channel.channelAddress,
        withdrawError: "fail",
        withdrawContext: undefined,
      });
      expect(node.sendDepositTx.callCount).to.be.eq(0);
      expect(node.withdraw.callCount).to.be.eq(1);
    });

    it("should reclaim all funds if profile.target is 0 and balance > collateralizeThreshold", async () => {
      const routerBalance = BigNumber.from(ethProfile.reclaimThreshold).mul(2);
      const { channel } = createTestChannelState(UpdateType.deposit, {
        alice: mkAddress("0xaaa"),
        aliceIdentifier: routerPublicIdentifier,
        assetIds: [AddressZero],
        balances: [
          {
            to: [mkAddress("0xaaa"), mkAddress("0xbbb")],
            amount: [routerBalance.toString(), "0"],
          },
        ],
      });
      const profile = { ...ethProfile, target: "0" };
      getRebalanceProfile.returns(Result.ok(profile));
      node.getStateChannel.resolves(Result.ok(channel));
      node.withdraw.resolves(Result.ok({ channelAddress: channel.channelAddress, transferId: getRandomBytes32() }));
      const res = await adjustCollateral(
        channel.channelAddress,
        AddressZero,
        routerPublicIdentifier,
        node as INodeService,
        chainReader,
        log,
      );
      expect(res.getError()).to.be.undefined;
      expect(res.getValue().channelAddress).to.be.ok;
      expect(node.sendDepositTx.callCount).to.be.eq(0);
      expect(node.withdraw.callCount).to.be.eq(1);
      expect(node.withdraw.firstCall.args[0]).to.be.deep.eq({
        channelAddress: channel.channelAddress,
        publicIdentifier: routerPublicIdentifier,
        assetId: AddressZero,
        amount: routerBalance.toString(),
        recipient: channel.alice,
      });
    });

    it("should do nothing if balance < collateralizeThreshold and target = 0", async () => {
      const { channel } = createTestChannelState(UpdateType.deposit, {
        alice: mkAddress("0xaaa"),
        aliceIdentifier: routerPublicIdentifier,
        assetIds: [AddressZero],
        balances: [{ to: [mkAddress("0xaaa"), mkAddress("0xbbb")], amount: ["10", "10"] }],
      });
      const profile = { ...ethProfile, target: "0" };
      getRebalanceProfile.returns(Result.ok(profile));
      node.getStateChannel.resolves(Result.ok(channel));
      const res = await adjustCollateral(
        channel.channelAddress,
        AddressZero,
        routerPublicIdentifier,
        node as INodeService,
        chainReader,
        log,
      );
      expect(res.getError()).to.be.undefined;
      expect(res.getValue()).to.be.undefined;
      expect(node.sendDepositTx.callCount).to.be.eq(0);
      expect(node.withdraw.callCount).to.be.eq(0);
    });
  });

  describe("requestCollateral", () => {
    it("should fail if getRebalanceProfile fails", async () => {
      getRebalanceProfile.returns(Result.fail(new Error("fail")));
      const { channel } = createTestChannelState(UpdateType.deposit);
      const res = await requestCollateral(
        channel,
        AddressZero,
        routerPublicIdentifier,
        node as INodeService,
        chainReader,
        log,
      );
      expect(res.getError().message).to.be.eq(CollateralError.reasons.UnableToGetRebalanceProfile);
    });

    it("should fail if it cannot get the chainProviders", async () => {
      const { channel } = createTestChannelState(UpdateType.deposit);
      chainReader.getHydratedProviders.returns(Result.fail(new Error("fail") as any));
      const res = await requestCollateral(
        channel,
        AddressZero,
        routerPublicIdentifier,
        node as INodeService,
        chainReader,
        log,
      );
      expect(res.getError().message).to.be.eq(CollateralError.reasons.ProviderNotFound);
    });

    it("should fail if it cannot get a provider on the right chain", async () => {
      const { channel } = createTestChannelState(UpdateType.deposit);
      chainReader.getHydratedProviders.returns(Result.ok({ [7]: {} as any }));
      const res = await requestCollateral(
        channel,
        AddressZero,
        routerPublicIdentifier,
        node as INodeService,
        chainReader,
        log,
      );
      expect(res.getError().message).to.be.eq(CollateralError.reasons.ProviderNotFound);
    });

    it("should fail if it cannot get the onchain balance", async () => {
      const { channel } = createTestChannelState(UpdateType.deposit);
      chainReader.getTotalDepositedB.resolves(Result.fail(new Error("fail") as any));
      const res = await requestCollateral(
        channel,
        AddressZero,
        routerPublicIdentifier,
        node as INodeService,
        chainReader,
        log,
      );
      expect(res.getError().message).to.be.eq(CollateralError.reasons.CouldNotGetOnchainDeposits);
    });

    describe("should work", () => {
      it("if requestedAmount is provided (and higher than target)", async () => {
        const { channel } = createTestChannelState(UpdateType.deposit);
        const requestedAmount = BigNumber.from(ethProfile.target).add(10000);
        const res = await requestCollateral(
          channel,
          AddressZero,
          routerPublicIdentifier,
          node as INodeService,
          chainReader,
          log,
          requestedAmount.toString(),
        );
        expect(res.isError).to.be.false;
        expect(node.sendDepositTx.callCount).to.be.eq(1);
        expect(node.sendDepositTx.firstCall.args[0]).to.be.deep.eq({
          publicIdentifier: routerPublicIdentifier,
          channelAddress: channel.channelAddress,
          chainId: channel.networkContext.chainId,
          assetId: AddressZero,
          amount: requestedAmount.sub(channel.balances[0].amount[1]).toString(),
        });
        expect(node.reconcileDeposit.callCount).to.be.eq(1);
      });

      it("if requestedAmount is provided (and lower than target)", async () => {
        const { channel } = createTestChannelState(UpdateType.deposit);
        const requestedAmount = BigNumber.from(ethProfile.target).sub(10000);
        const res = await requestCollateral(
          channel,
          AddressZero,
          routerPublicIdentifier,
          node as INodeService,
          chainReader,
          log,
          requestedAmount.toString(),
        );
        expect(res.isError).to.be.false;
        expect(node.sendDepositTx.callCount).to.be.eq(1);
        expect(node.sendDepositTx.firstCall.args[0]).to.be.deep.eq({
          publicIdentifier: routerPublicIdentifier,
          channelAddress: channel.channelAddress,
          chainId: channel.networkContext.chainId,
          assetId: AddressZero,
          amount: requestedAmount.sub(channel.balances[0].amount[1]).toString(),
        });
        expect(node.reconcileDeposit.callCount).to.be.eq(1);
      });

      it("if requestedAmount is not provided", async () => {
        const { channel } = createTestChannelState(UpdateType.deposit);
        const res = await requestCollateral(
          channel,
          AddressZero,
          routerPublicIdentifier,
          node as INodeService,
          chainReader,
          log,
        );
        expect(res.isError).to.be.false;
        expect(node.sendDepositTx.callCount).to.be.eq(1);
        expect(node.sendDepositTx.firstCall.args[0]).to.be.deep.eq({
          publicIdentifier: routerPublicIdentifier,
          channelAddress: channel.channelAddress,
          chainId: channel.networkContext.chainId,
          assetId: AddressZero,
          amount: BigNumber.from(ethProfile.target).sub(channel.balances[0].amount[1]).toString(),
        });
        expect(node.reconcileDeposit.callCount).to.be.eq(1);
      });

      it("if no collateral needed", async () => {
        const { channel } = createTestChannelState(UpdateType.deposit, {
          balances: [
            { to: [mkAddress(), mkAddress()], amount: [parseEther("10").toString(), parseEther("10").toString()] },
          ],
        });
        const res = await requestCollateral(
          channel,
          AddressZero,
          routerPublicIdentifier,
          node as INodeService,
          chainReader,
          log,
        );
        expect(res.isError).to.be.false;
        expect(res.getValue()).to.be.undefined;
        expect(node.sendDepositTx.callCount).to.be.eq(0);
        expect(node.reconcileDeposit.callCount).to.be.eq(0);
      });

      it("if there is only offchain reconciliation needed (no deposit sent onchain)", async () => {
        const { channel } = createTestChannelState(UpdateType.deposit);
        chainReader.getTotalDepositedB.resolves(Result.ok(parseEther("10")));
        const res = await requestCollateral(
          channel,
          AddressZero,
          routerPublicIdentifier,
          node as INodeService,
          chainReader,
          log,
        );
        expect(res.isError).to.be.false;
        expect(node.sendDepositTx.callCount).to.be.eq(0);
        expect(node.reconcileDeposit.callCount).to.be.eq(1);
      });

      it("if the profile.target is 0 and a requestedAmount is supplied", async () => {
        const { channel } = createTestChannelState(UpdateType.deposit);
        const requestedAmount = BigNumber.from(ethProfile.target).add(10000);
        const profile = { ...ethProfile, target: "0" };
        getRebalanceProfile.returns(Result.ok(profile));
        const res = await requestCollateral(
          channel,
          AddressZero,
          routerPublicIdentifier,
          node as INodeService,
          chainReader,
          log,
          requestedAmount.toString(),
        );
        expect(res.isError).to.be.false;
        expect(node.sendDepositTx.callCount).to.be.eq(1);
        expect(node.sendDepositTx.firstCall.args[0]).to.be.deep.eq({
          publicIdentifier: routerPublicIdentifier,
          channelAddress: channel.channelAddress,
          chainId: channel.networkContext.chainId,
          assetId: AddressZero,
          amount: requestedAmount.sub(channel.balances[0].amount[1]).toString(),
        });
        expect(node.reconcileDeposit.callCount).to.be.eq(1);
      });

      it("for two requests of the same amount", async () => {
        const { channel } = createTestChannelState(UpdateType.deposit, {
          aliceIdentifier: routerPublicIdentifier,
          processedDepositsA: ["0"],
          assetIds: [AddressZero],
        });
        const requestedAmount = parseEther("0.001");
        chainReader.getTotalDepositedA.onFirstCall().resolves(Result.ok(BigNumber.from(0)));
        chainReader.getTotalDepositedA.onSecondCall().resolves(Result.ok(requestedAmount));

        const res1 = await requestCollateral(
          channel,
          AddressZero,
          routerPublicIdentifier,
          node as INodeService,
          chainReader,
          log,
          requestedAmount.toString(),
        );

        const updatedChannel = { ...channel, processedDepositsA: [requestedAmount.toString()] };
        const res2 = await requestCollateral(
          updatedChannel,
          AddressZero,
          routerPublicIdentifier,
          node as INodeService,
          chainReader,
          log,
          requestedAmount.toString(),
        );
        expect(res1.isError).to.be.false;
        expect(res2.isError).to.be.false;
        expect(node.sendDepositTx.callCount).to.be.eq(2);
        expect(node.reconcileDeposit.callCount).to.be.eq(2);
      });
    });
  });
});
