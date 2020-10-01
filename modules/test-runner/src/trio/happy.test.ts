import { getRandomBytes32, IServerNodeService, RestServerNodeService, expect, delay } from "@connext/vector-utils";
import { Wallet, utils, constants, providers, BigNumber } from "ethers";
import pino from "pino";

import { env } from "../utils";

const chainId = parseInt(Object.keys(env.chainProviders)[0]);
const provider = new providers.JsonRpcProvider(env.chainProviders[chainId]);
const wallet = Wallet.fromMnemonic(env.sugarDaddy!).connect(provider);

const logger = pino({ level: env.logLevel });
const testName = "Trio Happy";

describe(testName, () => {
  let carol: IServerNodeService;
  let dave: IServerNodeService;
  let roger: IServerNodeService;
  before(async () => {
    carol = await RestServerNodeService.connect(
      env.carolUrl,
      "",
      env.chainProviders,
      {} as any,
      logger.child({ testName, name: "Alice" }),
    );
    expect(carol.signerAddress).to.be.a("string");
    expect(carol.publicIdentifier).to.be.a("string");

    dave = await RestServerNodeService.connect(
      env.daveUrl,
      "",
      env.chainProviders,
      {} as any,
      logger.child({ testName, name: "Bob" }),
    );
    expect(dave.signerAddress).to.be.a("string");
    expect(dave.publicIdentifier).to.be.a("string");

    roger = await RestServerNodeService.connect(
      env.rogerUrl,
      "",
      env.chainProviders,
      {} as any,
      logger.child({ testName, name: "Node" }),
    );
    expect(roger.signerAddress).to.be.a("string");
    expect(roger.publicIdentifier).to.be.a("string");

    let tx = await wallet.sendTransaction({ to: carol.signerAddress, value: utils.parseEther("0.5") });
    await tx.wait();
    tx = await wallet.sendTransaction({ to: dave.signerAddress, value: utils.parseEther("0.5") });
    await tx.wait();
    tx = await wallet.sendTransaction({ to: roger.signerAddress, value: utils.parseEther("0.5") });
    await tx.wait();
  });

  it("roger should setup channels with carol and dave", async () => {
    let channelRes = await roger.setup({
      chainId,
      counterpartyIdentifier: carol.publicIdentifier,
      timeout: "10000",
    });
    let channel = channelRes.getValue();
    expect(channel.channelAddress).to.be.ok;
    const carolChannel = await carol.getStateChannel({ channelAddress: channel.channelAddress });
    let rogerChannel = await roger.getStateChannel({ channelAddress: channel.channelAddress });
    expect(carolChannel.getValue()).to.deep.eq(rogerChannel.getValue());

    channelRes = await roger.setup({
      chainId,
      counterpartyIdentifier: dave.publicIdentifier,
      timeout: "10000",
    });
    channel = channelRes.getValue();
    expect(channel.channelAddress).to.be.ok;
    const daveChannel = await dave.getStateChannel({ channelAddress: channel.channelAddress });
    rogerChannel = await roger.getStateChannel({ channelAddress: channel.channelAddress });
    expect(daveChannel.getValue()).to.deep.eq(rogerChannel.getValue());
  });

  it("carol can deposit ETH into channel", async () => {
    const assetId = constants.AddressZero;
    const depositAmt = utils.parseEther("0.01");
    const channelRes = await carol.getStateChannelByParticipants({
      alice: roger.publicIdentifier,
      bob: carol.publicIdentifier,
      chainId,
    });
    const channel = channelRes.getValue()!;

    let assetIdx = channel.assetIds.findIndex(_assetId => _assetId === assetId);
    const carolBefore = assetIdx === -1 ? "0" : channel.balances[assetIdx].amount[1];

    const depositRes = await carol.deposit({
      chainId: channel.networkContext.chainId,
      amount: depositAmt.toString(),
      assetId,
      channelAddress: channel.channelAddress,
    });
    const deposit = depositRes.getValue();

    expect(deposit.channelAddress).to.be.a("string");

    const carolChannel = (await carol.getStateChannel({ channelAddress: channel.channelAddress })).getValue()!;
    const rogerChannel = (await roger.getStateChannel({ channelAddress: channel.channelAddress })).getValue()!;

    assetIdx = carolChannel.assetIds.findIndex(_assetId => _assetId === assetId);
    const carolAfter = carolChannel.balances[assetIdx].amount[1];
    expect(carolChannel).to.deep.eq(rogerChannel);

    expect(BigNumber.from(carolBefore).add(depositAmt)).to.eq(carolAfter);
  });

  it("carol can transfer ETH to dave via roger and resolve the transfer", async () => {
    const assetId = constants.AddressZero;
    const transferAmt = utils.parseEther("0.005");
    const carolChannelRes = await carol.getStateChannelByParticipants({
      alice: roger.publicIdentifier,
      bob: carol.publicIdentifier,
      chainId,
    });
    const carolChannel = carolChannelRes.getValue()!;

    const daveChannelRes = await dave.getStateChannelByParticipants({
      alice: roger.publicIdentifier,
      bob: dave.publicIdentifier,
      chainId,
    });
    const daveChannel = daveChannelRes.getValue()!;

    const carolAssetIdx = carolChannel.assetIds.findIndex(_assetId => _assetId === assetId);
    const carolBefore = carolAssetIdx === -1 ? "0" : carolChannel.balances[carolAssetIdx].amount[1];
    let daveAssetIdx = daveChannel.assetIds.findIndex(_assetId => _assetId === assetId);
    const daveBefore = daveAssetIdx === -1 ? "0" : daveChannel.balances[daveAssetIdx].amount[1];

    const preImage = getRandomBytes32();
    const linkedHash = utils.soliditySha256(["bytes32"], [preImage]);
    const routingId = getRandomBytes32();
    const transferRes = await carol.conditionalTransfer({
      amount: transferAmt.toString(),
      assetId,
      channelAddress: carolChannel.channelAddress,
      conditionType: "LinkedTransfer",
      details: {
        linkedHash,
      },
      meta: {
        routingId,
      },
      recipient: dave.publicIdentifier,
    });
    expect(transferRes.getError()).to.not.be.ok;

    const carolChannelAfterTransfer = (
      await carol.getStateChannel({ channelAddress: carolChannel.channelAddress })
    ).getValue()!;
    const carolBalanceAfterTransfer =
      carolAssetIdx === -1 ? "0" : carolChannelAfterTransfer.balances[carolAssetIdx].amount[0];
    expect(carolBalanceAfterTransfer).to.be.eq(BigNumber.from(carolBefore).sub(transferAmt));

    // need to delay until dave gets his transfer forwarded
    // TODO: change to use events
    await delay(10_000);

    // Get daves transfer
    const daveTransfer = (
      await dave.getTransferByRoutingId({ channelAddress: daveChannel.channelAddress, routingId })
    ).getValue()!;
    const resolveRes = await dave.resolveTransfer({
      channelAddress: daveChannel.channelAddress,
      conditionType: "LinkedTransfer",
      details: {
        preImage,
      },
      transferId: daveTransfer.transferId,
    });
    expect(resolveRes.getError()).to.not.be.ok;

    const channelAfterResolve = (
      await dave.getStateChannel({ channelAddress: daveChannel.channelAddress })
    ).getValue()!;
    daveAssetIdx = channelAfterResolve.assetIds.findIndex(_assetId => _assetId === assetId);
    const daveAfterResolve = channelAfterResolve.balances[daveAssetIdx].amount[1];
    expect(daveAfterResolve).to.be.eq(BigNumber.from(daveBefore).add(transferAmt));
  });
});
