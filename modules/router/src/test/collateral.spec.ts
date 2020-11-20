import {
  createTestChannelState,
  expect,
  getRandomBytes32,
  mkAddress,
  RestServerNodeService,
  getBalanceForAssetId,
} from "@connext/vector-utils";
import Sinon from "sinon";
import pino from "pino";
import { BigNumber } from "@ethersproject/bignumber";
import { AddressZero } from "@ethersproject/constants";
import { INodeService, Result } from "@connext/vector-types";

import { config } from "../config";
import { requestCollateral } from "../collateral";
import { getRebalanceProfile } from "../services/rebalance";

import { mockProvider } from "./utils/mocks";

const logger = pino({ level: config.logLevel });
const hydratedProviders = { 1337: mockProvider };

describe("Collateral", () => {
  let node: Sinon.SinonStubbedInstance<RestServerNodeService>;

  beforeEach(async () => {
    node = Sinon.createStubInstance(RestServerNodeService);
    node.conditionalTransfer.resolves(Result.ok({} as any));
    node.sendDepositTx.resolves(Result.ok({ txHash: getRandomBytes32() }));
    node.reconcileDeposit.resolves(Result.ok({ channelAddress: mkAddress() }));
  });

  afterEach(() => {
    // TODO: this breaks tests, why???
    // Sinon.restore();
  });

  it("should request collateral without a target", async () => {
    const assetId = AddressZero;
    const channel = createTestChannelState("create");
    const rebalanceProfileRes = await getRebalanceProfile(channel.networkContext.chainId, assetId);
    const profile = rebalanceProfileRes.getValue();

    await requestCollateral(channel, assetId, channel.aliceIdentifier, node as INodeService, hydratedProviders, logger);
    node.sendDepositTx.getCall(0);

    expect(
      node.sendDepositTx.calledWith({
        amount: BigNumber.from(profile.target)
          .sub(getBalanceForAssetId(channel, assetId, "alice"))
          .toString(),
        assetId,
        chainId: channel.networkContext.chainId,
        channelAddress: channel.channelAddress,
        publicIdentifier: channel.aliceIdentifier,
      }),
    ).to.be.true;
  });

  it("should request collateral with a requested amount higher than the target", async () => {
    const assetId = AddressZero;
    const channel = createTestChannelState("create");
    const rebalanceProfileRes = await getRebalanceProfile(channel.networkContext.chainId, assetId);
    const profile = rebalanceProfileRes.getValue();

    const requestedAmount = BigNumber.from(profile.target).add(10);
    await requestCollateral(
      channel,
      assetId,
      channel.aliceIdentifier,
      node as INodeService,
      hydratedProviders,
      logger,
      requestedAmount.toString(),
    );
    node.sendDepositTx.getCall(0);

    expect(
      node.sendDepositTx.calledWith({
        amount: BigNumber.from(requestedAmount)
          .sub(getBalanceForAssetId(channel, assetId, "alice"))
          .toString(),
        assetId,
        chainId: channel.networkContext.chainId,
        channelAddress: channel.channelAddress,
        publicIdentifier: channel.aliceIdentifier,
      }),
    ).to.be.true;
  });

  it("should request collateral with a requested amount lower than the target", async () => {
    const assetId = AddressZero;
    const channel = createTestChannelState("create");
    const rebalanceProfileRes = await getRebalanceProfile(channel.networkContext.chainId, assetId);
    const profile = rebalanceProfileRes.getValue();

    const requestedAmount = BigNumber.from(profile.target).sub(10);
    await requestCollateral(
      channel,
      assetId,
      channel.aliceIdentifier,
      node as INodeService,
      hydratedProviders,
      logger,
      requestedAmount.toString(),
    );
    node.sendDepositTx.getCall(0);

    expect(
      node.sendDepositTx.calledWith({
        amount: BigNumber.from(requestedAmount)
          .sub(getBalanceForAssetId(channel, assetId, "alice"))
          .toString(),
        assetId,
        chainId: channel.networkContext.chainId,
        channelAddress: channel.channelAddress,
        publicIdentifier: channel.aliceIdentifier,
      }),
    ).to.be.true;
  });

  it("should error on request collateral with a requested amount higher than reclaim threshold", async () => {
    const assetId = AddressZero;
    const channel = createTestChannelState("create");
    const rebalanceProfileRes = await getRebalanceProfile(channel.networkContext.chainId, assetId);
    const profile = rebalanceProfileRes.getValue();

    const requestedAmount = BigNumber.from(profile.reclaimThreshold).add(10);
    const req = await requestCollateral(
      channel,
      assetId,
      channel.aliceIdentifier,
      node as INodeService,
      hydratedProviders,
      logger,
      requestedAmount.toString(),
    );
    expect(req.isError).to.be.true;
  });

  it("should request collateral with a transfer amount higher than the threshold", async () => {
    const assetId = AddressZero;
    const channel = createTestChannelState("create");
    const rebalanceProfileRes = await getRebalanceProfile(channel.networkContext.chainId, assetId);
    const profile = rebalanceProfileRes.getValue();

    const requestedAmount = BigNumber.from(profile.target).sub(10);
    const transferAmount = BigNumber.from(profile.reclaimThreshold).add(10);
    await requestCollateral(
      channel,
      assetId,
      channel.aliceIdentifier,
      node as INodeService,
      hydratedProviders,
      logger,
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
