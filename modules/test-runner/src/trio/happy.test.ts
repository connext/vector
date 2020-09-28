import { getRandomBytes32, IServerNodeService, RestServerNodeService } from "@connext/vector-utils";
import { Wallet, utils, constants, providers, BigNumber } from "ethers";
import pino from "pino";

import { env, expect } from "../utils";

const chainId = parseInt(Object.keys(env.chainProviders)[0]);
const provider = new providers.JsonRpcProvider(env.chainProviders[chainId]);
const wallet = Wallet.fromMnemonic(env.sugarDaddy!).connect(provider);

const logger = pino({ level: env.logLevel });
const testName = "Trio Happy";

describe(testName, () => {
  let alice: IServerNodeService;
  let bob: IServerNodeService;
  let node: IServerNodeService;
  before(async () => {
    alice = await RestServerNodeService.connect(
      env.aliceUrl,
      "",
      env.chainProviders,
      {} as any,
      logger.child({ testName, name: "Alice" }),
    );
    expect(alice.signerAddress).to.be.a("string");
    expect(alice.publicIdentifier).to.be.a("string");

    bob = await RestServerNodeService.connect(
      env.bobUrl,
      "",
      env.chainProviders,
      {} as any,
      logger.child({ testName, name: "Bob" }),
    );
    expect(bob.signerAddress).to.be.a("string");
    expect(bob.publicIdentifier).to.be.a("string");

    node = await RestServerNodeService.connect(
      env.nodeUrl,
      "",
      env.chainProviders,
      {} as any,
      logger.child({ testName, name: "Node" }),
    );
    expect(node.signerAddress).to.be.a("string");
    expect(node.publicIdentifier).to.be.a("string");

    let tx = await wallet.sendTransaction({ to: alice.signerAddress, value: utils.parseEther("0.1") });
    await tx.wait();
    tx = await wallet.sendTransaction({ to: bob.signerAddress, value: utils.parseEther("0.1") });
    await tx.wait();
  });

  it("node should setup channels with alice and bob", async () => {
    let channelRes = await node.setup({
      chainId,
      counterpartyIdentifier: alice.publicIdentifier,
      timeout: "10000",
    });
    let channel = channelRes.getValue();
    expect(channel.channelAddress).to.be.ok;
    const aliceChannel = await alice.getStateChannel(channel.channelAddress);
    let nodeChannel = await node.getStateChannel(channel.channelAddress);
    expect(aliceChannel.getValue()).to.deep.eq(nodeChannel.getValue());

    channelRes = await node.setup({
      chainId,
      counterpartyIdentifier: bob.publicIdentifier,
      timeout: "10000",
    });
    channel = channelRes.getValue();
    expect(channel.channelAddress).to.be.ok;
    const bobChannel = await bob.getStateChannel(channel.channelAddress);
    nodeChannel = await node.getStateChannel(channel.channelAddress);
    expect(bobChannel.getValue()).to.deep.eq(nodeChannel.getValue());
  });

  it.only("alice can deposit ETH into channel", async () => {
    const assetId = constants.AddressZero;
    const depositAmt = utils.parseEther("0.01");
    const channelRes = await alice.getStateChannelByParticipants(
      node.publicIdentifier,
      alice.publicIdentifier,
      chainId,
    );
    const channel = channelRes.getValue()!;

    let assetIdx = channel.assetIds.findIndex(_assetId => _assetId === assetId);
    const aliceBefore = assetIdx === -1 ? "0" : channel.balances[assetIdx].amount[1];

    const depositRes = await alice.deposit(
      {
        amount: depositAmt.toString(),
        assetId,
        channelAddress: channel.channelAddress,
      },
      channel.networkContext.chainId,
    );
    const deposit = depositRes.getValue();

    expect(deposit.channelAddress).to.be.a("string");

    const aliceChannel = (await alice.getStateChannel(channel.channelAddress)).getValue()!;
    const nodeChannel = (await node.getStateChannel(channel.channelAddress)).getValue()!;

    assetIdx = aliceChannel.assetIds.findIndex(_assetId => _assetId === assetId);
    const aliceAfter = aliceChannel.balances[assetIdx].amount[1];
    expect(aliceChannel).to.deep.eq(nodeChannel);

    expect(BigNumber.from(aliceBefore).add(depositAmt)).to.eq(aliceAfter);
  });

  it.only("alice can transfer ETH to bob over node and resolve the transfer", async () => {
    const assetId = constants.AddressZero;
    const transferAmt = utils.parseEther("0.005");
    const channelRes = await alice.getStateChannelByParticipants(
      node.publicIdentifier,
      alice.publicIdentifier,
      chainId,
    );
    const channel = channelRes.getValue()!;

    const assetIdx = channel.assetIds.findIndex(_assetId => _assetId === assetId);
    const aliceBefore = assetIdx === -1 ? "0" : channel.balances[assetIdx].amount[1];

    const preImage = getRandomBytes32();
    const linkedHash = utils.soliditySha256(["bytes32"], [preImage]);
    const routingId = getRandomBytes32();
    const transferRes = await alice.conditionalTransfer({
      amount: transferAmt.toString(),
      assetId,
      channelAddress: channel.channelAddress,
      conditionType: "LinkedTransfer",
      details: {
        linkedHash,
      },
      meta: {},
      routingId,
      recipient: bob.publicIdentifier,
    });
    expect(transferRes.isError).to.not.be.ok;

    const channelAfterTransfer = (await alice.getStateChannel(channel.channelAddress)).getValue()!;
    console.log("channelAfterTransfer: ", channelAfterTransfer);
    const aliceAfterTransfer = assetIdx === -1 ? "0" : channelAfterTransfer.balances[assetIdx].amount[0];
    expect(aliceAfterTransfer).to.be.eq(BigNumber.from(aliceBefore).sub(transferAmt));

    // const resolveRes = await bob.resolveTransfer({
    //   channelAddress: channel.channelAddress,
    //   conditionType: "LinkedTransfer",
    //   details: {
    //     preImage,
    //   },
    //   routingId,
    // });
    // expect(resolveRes.isError).to.not.be.ok;

    // const channelAfterResolve = (await alice.getStateChannel(channel.channelAddress)).getValue()!;
    // const bobAfterResolve = assetIdx === -1 ? "0" : channelAfterResolve.balances[assetIdx].amount[1];
    // expect(bobAfterResolve).to.be.eq(BigNumber.from(bobBefore).add(transferAmt));
  });
});
