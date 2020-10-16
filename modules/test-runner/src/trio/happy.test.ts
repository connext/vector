import { getRandomBytes32, RestServerNodeService, expect, delay } from "@connext/vector-utils";
import { Wallet, utils, constants, providers, BigNumber } from "ethers";
import pino from "pino";
import { EngineEvents, INodeService, TransferNames } from "@connext/vector-types";

import { env, getRandomIndex } from "../utils";

import { carolEvts, daveEvts, rogerEvts } from "./setup";

const chainId = parseInt(Object.keys(env.chainProviders)[0]);
const provider = new providers.JsonRpcProvider(env.chainProviders[chainId]);
const wallet = Wallet.fromMnemonic(env.sugarDaddy!).connect(provider);

const logger = pino({ level: env.logLevel });
const testName = "Trio Happy";

describe(testName, () => {
  let carolService: INodeService;
  let carolIdentifier: string;
  let carol: string;

  let daveService: INodeService;
  let daveIdentifier: string;
  let dave: string;

  let rogerService: INodeService;
  let rogerIdentifier: string;
  let roger: string;
  console.log();
  before(async () => {
    const randomIndex = getRandomIndex();
    carolService = await RestServerNodeService.connect(
      env.carolUrl,
      logger.child({ testName, name: "Carl" }),
      carolEvts,
      randomIndex,
    );
    carolIdentifier = carolService.publicIdentifier;
    carol = carolService.signerAddress;
    const carolTx = await wallet.sendTransaction({ to: carol, value: utils.parseEther("0.5") });
    await carolTx.wait();

    daveService = await RestServerNodeService.connect(
      env.daveUrl,
      logger.child({ testName, name: "Dave" }),
      daveEvts,
      randomIndex,
    );
    daveIdentifier = daveService.publicIdentifier;
    dave = daveService.signerAddress;
    const daveTx = await wallet.sendTransaction({ to: dave, value: utils.parseEther("0.5") });
    await daveTx.wait();

    rogerService = await RestServerNodeService.connect(
      env.rogerUrl,
      logger.child({ testName, name: "Roger" }),
      rogerEvts,
      0,
    );
    rogerIdentifier = rogerService.publicIdentifier;
    roger = rogerService.signerAddress;
    const rogerTx = await wallet.sendTransaction({ to: roger, value: utils.parseEther("0.5") });
    await rogerTx.wait();
  });

  it("roger should setup channels with carol and dave", async () => {
    let channelRes = await carolService.requestSetup({
      aliceUrl: env.rogerUrl,
      aliceIdentifier: rogerIdentifier,
      bobIdentifier: carolIdentifier,
      chainId,
      timeout: "10000",
    });
    let channel = channelRes.getValue();
    expect(channel.channelAddress).to.be.ok;
    const carolChannel = await carolService.getStateChannel({
      channelAddress: channel.channelAddress,
      publicIdentifier: carolIdentifier,
    });
    let rogerChannel = await rogerService.getStateChannel({
      channelAddress: channel.channelAddress,
      publicIdentifier: rogerIdentifier,
    });
    expect(carolChannel.getValue()).to.deep.eq(rogerChannel.getValue());

    channelRes = await daveService.requestSetup({
      aliceUrl: env.rogerUrl,
      aliceIdentifier: rogerIdentifier,
      bobIdentifier: daveIdentifier,
      chainId,
      timeout: "10000",
    });
    channel = channelRes.getValue();
    expect(channel.channelAddress).to.be.ok;
    const daveChannel = await daveService.getStateChannel({
      channelAddress: channel.channelAddress,
      publicIdentifier: daveIdentifier,
    });
    rogerChannel = await rogerService.getStateChannel({
      channelAddress: channel.channelAddress,
      publicIdentifier: rogerIdentifier,
    });
    expect(daveChannel.getValue()).to.deep.eq(rogerChannel.getValue());
  });

  it("carol can deposit ETH into channel", async () => {
    const assetId = constants.AddressZero;
    const depositAmt = utils.parseEther("0.01");
    const channelRes = await carolService.getStateChannelByParticipants({
      counterparty: rogerIdentifier,
      chainId,
      publicIdentifier: carolIdentifier,
    });
    const channel = channelRes.getValue()!;

    let assetIdx = channel.assetIds.findIndex((_assetId: string) => _assetId === assetId);
    const carolBefore = assetIdx === -1 ? "0" : channel.balances[assetIdx].amount[1];

    const tx = await wallet.sendTransaction({ to: channel.channelAddress, value: depositAmt });
    await tx.wait();

    const depositRes = await carolService.reconcileDeposit({
      assetId,
      channelAddress: channel.channelAddress,
      publicIdentifier: carolIdentifier,
    });
    const deposit = depositRes.getValue();

    expect(deposit.channelAddress).to.be.a("string");

    const carolChannel = (
      await carolService.getStateChannel({ channelAddress: channel.channelAddress, publicIdentifier: carolIdentifier })
    ).getValue()!;
    const rogerChannel = (
      await rogerService.getStateChannel({ channelAddress: channel.channelAddress, publicIdentifier: rogerIdentifier })
    ).getValue()!;

    assetIdx = carolChannel.assetIds.findIndex((_assetId: string) => _assetId === assetId);
    const carolAfter = carolChannel.balances[assetIdx].amount[1];
    expect(carolChannel).to.deep.eq(rogerChannel);

    expect(BigNumber.from(carolBefore).add(depositAmt)).to.eq(carolAfter);
  });

  it("carol can transfer ETH to dave via roger and resolve the transfer", async () => {
    const assetId = constants.AddressZero;
    const transferAmt = utils.parseEther("0.005");
    const carolChannelRes = await carolService.getStateChannelByParticipants({
      counterparty: rogerIdentifier,
      chainId,
      publicIdentifier: carolIdentifier,
    });
    const carolChannel = carolChannelRes.getValue()!;
    const daveChannelRes = await daveService.getStateChannelByParticipants({
      counterparty: rogerIdentifier,
      chainId,
      publicIdentifier: daveIdentifier,
    });
    const daveChannel = daveChannelRes.getValue()!;

    const carolAssetIdx = carolChannel.assetIds.findIndex(_assetId => _assetId === assetId);
    const carolBefore = carolAssetIdx === -1 ? "0" : carolChannel.balances[carolAssetIdx].amount[1];
    let daveAssetIdx = daveChannel.assetIds.findIndex(_assetId => _assetId === assetId);
    const daveBefore = daveAssetIdx === -1 ? "0" : daveChannel.balances[daveAssetIdx].amount[1];

    const preImage = getRandomBytes32();
    const lockHash = utils.soliditySha256(["bytes32"], [preImage]);
    const routingId = getRandomBytes32();

    const carolCreatePromise = carolService.waitFor(EngineEvents.CONDITIONAL_TRANSFER_CREATED, 10_000);
    const rogerCreatePromise = rogerService.waitFor(EngineEvents.CONDITIONAL_TRANSFER_CREATED, 10_000);
    const transferRes = await carolService.conditionalTransfer({
      publicIdentifier: carolIdentifier,
      amount: transferAmt.toString(),
      assetId,
      channelAddress: carolChannel.channelAddress,
      type: TransferNames.HashlockTransfer,
      details: {
        lockHash,
        expiry: "0",
      },
      meta: {
        routingId,
      },
      recipient: daveIdentifier,
    });
    expect(transferRes.getError()).to.not.be.ok;

    const carolChannelAfterTransfer = (
      await carolService.getStateChannel({
        channelAddress: carolChannel.channelAddress,
        publicIdentifier: carolIdentifier,
      })
    ).getValue()!;
    const carolBalanceAfterTransfer =
      carolAssetIdx === -1 ? "0" : carolChannelAfterTransfer.balances[carolAssetIdx].amount[1];
    expect(carolBalanceAfterTransfer).to.be.eq(BigNumber.from(carolBefore).sub(transferAmt));

    const [carolCreate, rogerCreate] = await Promise.all([carolCreatePromise, rogerCreatePromise]);
    expect(carolCreate).to.deep.eq(rogerCreate);

    // Get daves transfer
    const daveTransfer = (
      await daveService.getTransferByRoutingId({
        channelAddress: daveChannel.channelAddress,
        routingId,
        publicIdentifier: daveIdentifier,
      })
    ).getValue()!;

    const carolResolvePromise = carolService.waitFor(EngineEvents.CONDITIONAL_TRANSFER_CREATED, 10_000);
    const rogerResolvePromise = rogerService.waitFor(EngineEvents.CONDITIONAL_TRANSFER_CREATED, 10_000);
    const resolveRes = await daveService.resolveTransfer({
      publicIdentifier: daveIdentifier,
      channelAddress: daveChannel.channelAddress,
      transferResolver: {
        preImage,
      },
      transferId: daveTransfer.transferId,
    });
    expect(resolveRes.getError()).to.not.be.ok;

    const [carolResolve, rogerResolve] = await Promise.all([carolResolvePromise, rogerResolvePromise]);
    expect(carolResolve).to.deep.eq(rogerResolve);

    const channelAfterResolve = (
      await daveService.getStateChannel({
        channelAddress: daveChannel.channelAddress,
        publicIdentifier: daveIdentifier,
      })
    ).getValue()!;
    daveAssetIdx = channelAfterResolve.assetIds.findIndex(_assetId => _assetId === assetId);
    const daveAfterResolve = channelAfterResolve.balances[daveAssetIdx].amount[1];
    expect(daveAfterResolve).to.be.eq(BigNumber.from(daveBefore).add(transferAmt));
  });
});
