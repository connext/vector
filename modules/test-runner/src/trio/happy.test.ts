import { getRandomBytes32, RestServerNodeService, expect } from "@connext/vector-utils";
import { Wallet, utils, constants, providers, BigNumber } from "ethers";
import pino from "pino";
import { EngineEvents, INodeService, TransferNames } from "@connext/vector-types";

import { env, fundIfBelow, getRandomIndex } from "../utils";

import { carolEvts, daveEvts } from "./setup";

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
  before(async () => {
    const randomIndex = getRandomIndex();
    carolService = await RestServerNodeService.connect(
      env.carolUrl,
      logger.child({ testName, name: "Carol" }),
      carolEvts,
      randomIndex,
    );
    carolIdentifier = carolService.publicIdentifier;
    carol = carolService.signerAddress;
    const min = utils.parseEther("0.1");
    await fundIfBelow(carol, constants.AddressZero, min, wallet);

    daveService = await RestServerNodeService.connect(
      env.daveUrl,
      logger.child({ testName, name: "Dave" }),
      daveEvts,
      randomIndex,
    );
    daveIdentifier = daveService.publicIdentifier;
    dave = daveService.signerAddress;
    await fundIfBelow(dave, constants.AddressZero, min, wallet);

    rogerService = await RestServerNodeService.connect(
      env.rogerUrl,
      logger.child({ testName, name: "Roger" }),
      undefined,
      0,
    );
    rogerIdentifier = rogerService.publicIdentifier;
    roger = rogerService.signerAddress;
    await fundIfBelow(roger, constants.AddressZero, min.mul(2), wallet);
  });

  it("roger should setup channels with carol and dave", async () => {
    let channelRes = await carolService.setup({
      counterpartyIdentifier: rogerIdentifier,
      chainId,
      timeout: "360000",
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

    channelRes = await daveService.setup({
      counterpartyIdentifier: rogerIdentifier,
      chainId,
      timeout: "360000",
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

    const carolCreatePromise = carolService.waitFor(EngineEvents.CONDITIONAL_TRANSFER_CREATED, 30_000);
    const daveCreatePromise = daveService.waitFor(EngineEvents.CONDITIONAL_TRANSFER_CREATED, 30_000);
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
    const [carolCreate, daveCreate] = await Promise.all([carolCreatePromise, daveCreatePromise]);
    expect(carolCreate).to.be.ok;
    expect(daveCreate).to.be.ok;
    // Get daves
    const daveTransferRes = await daveService.getTransferByRoutingId({
      channelAddress: daveChannel.channelAddress,
      routingId,
      publicIdentifier: daveIdentifier,
    });

    expect(daveTransferRes.getError()).to.not.be.ok;
    const daveTransfer = daveTransferRes.getValue();

    const daveResolvePromise = daveService.waitFor(EngineEvents.CONDITIONAL_TRANSFER_RESOLVED, 30_000);
    const resolveRes = await daveService.resolveTransfer({
      publicIdentifier: daveIdentifier,
      channelAddress: daveChannel.channelAddress,
      transferResolver: {
        preImage,
      },
      transferId: daveTransfer.transferId,
    });
    expect(resolveRes.getError()).to.not.be.ok;
    const daveResolve = await daveResolvePromise;
    expect(daveResolve).to.be.ok;

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
