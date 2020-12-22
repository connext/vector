import { VectorChainReader } from "@connext/vector-contracts";
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
import { getRebalanceProfile } from "../services/config";

const logger = pino({ level: config.logLevel });

describe("Collateral", () => {
  let node: Sinon.SinonStubbedInstance<RestServerNodeService>;
  let chainReader: Sinon.SinonStubbedInstance<VectorChainReader>;

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
  });

  afterEach(() => {
    // TODO: why doesnt this work
    Sinon.restore();
    Sinon.reset();
  });

  // it("should get profiles for different assetIds", async () => {
  //   const channel = createTestChannelState("create").channel;
  //   const rebalanceProfileEthRes = getRebalanceProfile(channel.networkContext.chainId, AddressZero);
  //   const profileEth = rebalanceProfileEthRes.getValue();
  //   expect(profileEth.assetId).eq(AddressZero);

  //   const tokenProfile = config.rebalanceProfiles.find(
  //     (prof) => prof.chainId === channel.networkContext.chainId && prof.assetId !== AddressZero,
  //   );
  //   const rebalanceProfileTokenRes = getRebalanceProfile(channel.networkContext.chainId, tokenProfile.assetId);
  //   const profileToken = rebalanceProfileTokenRes.getValue();
  //   expect(profileToken.assetId).eq(tokenProfile.assetId);
  // });
  it("should fail if getRebalanceProfile fails", async () => {});
  it("should fail if requestedAmount > reclaimThreshold", async () => {});
  it("should fail if it cannot get the chainProviders", async () => {});
  it("should fail if it cannot get a providerUrl", async () => {});
  it("should fail if it cannot get the onchain balance", async () => {});

  describe("should work", () => {
    it("if profile.target > requestedAmount (deposits larger of two)", async () => {});
    it("if requestedAmount > profile.target (deposits larger of two)", async () => {});
    it("if transferAmount provided", async () => {});
    it("if no collateral needed", async () => {});
    it("if there is only offchain reconciliation needed (no deposit sent onchain)", async () => {});
    it("if an onchain deposit is needed", async () => {});
    it("if requested amount higher than the target", async () => {});
  });

  it("should request collateral without a target", async () => {
    const assetId = AddressZero;
    const channel = createTestChannelState("create").channel;
    const rebalanceProfileRes = getRebalanceProfile(channel.networkContext.chainId, assetId);
    const profile = rebalanceProfileRes.getValue();

    await requestCollateral(channel, assetId, channel.aliceIdentifier, node as INodeService, chainReader, logger);
    node.sendDepositTx.getCall(0);

    expect(
      node.sendDepositTx.calledWith({
        amount: BigNumber.from(profile.target).sub(getBalanceForAssetId(channel, assetId, "alice")).toString(),
        assetId,
        chainId: channel.networkContext.chainId,
        channelAddress: channel.channelAddress,
        publicIdentifier: channel.aliceIdentifier,
      }),
    ).to.be.true;
  });

  it("should request collateral with a requested amount higher than the target", async () => {
    const assetId = AddressZero;
    const channel = createTestChannelState("create").channel;
    const rebalanceProfileRes = getRebalanceProfile(channel.networkContext.chainId, assetId);
    const profile = rebalanceProfileRes.getValue();

    const requestedAmount = BigNumber.from(profile.target).add(10);
    await requestCollateral(
      channel,
      assetId,
      channel.aliceIdentifier,
      node as INodeService,
      chainReader,
      logger,
      requestedAmount.toString(),
    );
    node.sendDepositTx.getCall(0);

    expect(
      node.sendDepositTx.calledWith({
        amount: BigNumber.from(requestedAmount).sub(getBalanceForAssetId(channel, assetId, "alice")).toString(),
        assetId,
        chainId: channel.networkContext.chainId,
        channelAddress: channel.channelAddress,
        publicIdentifier: channel.aliceIdentifier,
      }),
    ).to.be.true;
  });

  it("should request collateral with a requested amount lower than the target", async () => {
    const assetId = AddressZero;
    const channel = createTestChannelState("create").channel;
    const rebalanceProfileRes = getRebalanceProfile(channel.networkContext.chainId, assetId);
    const profile = rebalanceProfileRes.getValue();

    const requestedAmount = BigNumber.from(profile.target).sub(10);
    await requestCollateral(
      channel,
      assetId,
      channel.aliceIdentifier,
      node as INodeService,
      chainReader,
      logger,
      requestedAmount.toString(),
    );
    node.sendDepositTx.getCall(0);

    expect(
      node.sendDepositTx.calledWith({
        amount: BigNumber.from(requestedAmount).sub(getBalanceForAssetId(channel, assetId, "alice")).toString(),
        assetId,
        chainId: channel.networkContext.chainId,
        channelAddress: channel.channelAddress,
        publicIdentifier: channel.aliceIdentifier,
      }),
    ).to.be.true;
  });

  it("should error on request collateral with a requested amount higher than reclaim threshold", async () => {
    const assetId = AddressZero;
    const channel = createTestChannelState("create").channel;
    const rebalanceProfileRes = getRebalanceProfile(channel.networkContext.chainId, assetId);
    const profile = rebalanceProfileRes.getValue();

    const requestedAmount = BigNumber.from(profile.reclaimThreshold).add(10);
    const req = await requestCollateral(
      channel,
      assetId,
      channel.aliceIdentifier,
      node as INodeService,
      chainReader,
      logger,
      requestedAmount.toString(),
    );
    expect(req.isError).to.be.true;
  });

  it("should request collateral with a transfer amount higher than the threshold", async () => {
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
