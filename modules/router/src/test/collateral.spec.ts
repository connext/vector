import { VectorChainReader } from "@connext/vector-contracts";
import {
  createTestChannelState,
  expect,
  getRandomBytes32,
  mkAddress,
  RestServerNodeService,
  getBalanceForAssetId,
  mkPublicIdentifier,
  getTestLoggers,
} from "@connext/vector-utils";
import Sinon from "sinon";
import { BigNumber } from "@ethersproject/bignumber";
import { AddressZero } from "@ethersproject/constants";
import { INodeService, Result, UpdateType } from "@connext/vector-types";
import { parseEther } from "@ethersproject/units";

import { config } from "../config";
import { requestCollateral } from "../collateral";
import * as configService from "../services/config";
import { RequestCollateralError } from "../errors";

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
    // TODO: why doesnt this work
    Sinon.restore();
    Sinon.reset();
  });

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
    expect(res.getError().message).to.be.eq(RequestCollateralError.reasons.UnableToGetRebalanceProfile);
  });

  it("should fail if requestedAmount > reclaimThreshold", async () => {
    const { channel } = createTestChannelState(UpdateType.deposit);
    const res = await requestCollateral(
      channel,
      AddressZero,
      routerPublicIdentifier,
      node as INodeService,
      chainReader,
      log,
      BigNumber.from(ethProfile.reclaimThreshold).add(120).toString(),
    );
    expect(res.getError().message).to.be.eq(RequestCollateralError.reasons.TargetHigherThanThreshold);
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
    expect(res.getError().message).to.be.eq(RequestCollateralError.reasons.ProviderNotFound);
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
    expect(res.getError().message).to.be.eq(RequestCollateralError.reasons.ProviderNotFound);
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
    expect(res.getError().message).to.be.eq(RequestCollateralError.reasons.CouldNotGetOnchainDeposits);
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

    it("if transferAmount provided", async () => {
      const { channel } = createTestChannelState(UpdateType.deposit);
      const requestedAmount = BigNumber.from(ethProfile.target).add(10000);
      const transferAmount = BigNumber.from(17);
      const res = await requestCollateral(
        channel,
        AddressZero,
        routerPublicIdentifier,
        node as INodeService,
        chainReader,
        log,
        requestedAmount.toString(),
        transferAmount.toString(),
      );
      expect(res.isError).to.be.false;
      expect(node.sendDepositTx.callCount).to.be.eq(1);
      expect(node.sendDepositTx.firstCall.args[0]).to.be.deep.eq({
        publicIdentifier: routerPublicIdentifier,
        channelAddress: channel.channelAddress,
        chainId: channel.networkContext.chainId,
        assetId: AddressZero,
        amount: requestedAmount.sub(channel.balances[0].amount[1]).add(transferAmount).toString(),
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

    it("if the transfer amount is higher than the threshold", async () => {
      const assetId = AddressZero;
      const channel = createTestChannelState("create").channel;
      const rebalanceProfileRes = getRebalanceProfile(channel.networkContext.chainId, assetId);
      const profile = rebalanceProfileRes.getValue();

      const requestedAmount = BigNumber.from(profile.target).sub(10);
      const transferAmount = BigNumber.from(profile.reclaimThreshold).add(10);
      await requestCollateral(
        channel,
        assetId,
        channel.aliceIdentifier,
        node as INodeService,
        chainReader,
        log,
        requestedAmount.toString(),
        transferAmount.toString(),
      );
      node.sendDepositTx.getCall(0);

      expect(
        node.sendDepositTx.calledWith({
          amount: BigNumber.from(requestedAmount)
            .add(transferAmount)
            .sub(getBalanceForAssetId(channel, assetId, "alice"))
            .toString(),
          assetId,
          chainId: channel.networkContext.chainId,
          channelAddress: channel.channelAddress,
          publicIdentifier: channel.aliceIdentifier,
        }),
      ).to.be.true;
    });
  });
});
