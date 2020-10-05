import { getRandomBytes32, IServerNodeService, RestServerNodeService, expect } from "@connext/vector-utils";
import { Wallet, utils, constants, providers, BigNumber } from "ethers";
import pino from "pino";

import { env, getRandomIndex } from "../utils";

const chainId = parseInt(Object.keys(env.chainProviders)[0]);
const provider = new providers.JsonRpcProvider(env.chainProviders[chainId]);
const wallet = Wallet.fromMnemonic(env.sugarDaddy!).connect(provider);

const logger = pino({ level: env.logLevel });
const testName = "Duet Happy";

describe(testName, () => {
  let alice: IServerNodeService;
  let bob: IServerNodeService;

  before(async () => {
    alice = await RestServerNodeService.connect(
      env.aliceUrl,
      env.chainProviders,
      logger.child({ testName }),
      undefined,
      getRandomIndex(),
    );
    expect(alice.signerAddress).to.be.a("string");
    expect(alice.publicIdentifier).to.be.a("string");
    bob = await RestServerNodeService.connect(
      env.bobUrl,
      env.chainProviders,
      logger.child({ testName }),
      undefined,
      getRandomIndex(),
    );
    expect(bob.signerAddress).to.be.a("string");
    expect(bob.publicIdentifier).to.be.a("string");

    let tx = await wallet.sendTransaction({ to: alice.signerAddress, value: utils.parseEther("0.1") });
    await tx.wait();
    tx = await wallet.sendTransaction({ to: bob.signerAddress, value: utils.parseEther("0.1") });
    await tx.wait();
  });

  it("alice & bob should setup a channel", async () => {
    const channelRes = await alice.setup({
      chainId,
      counterpartyIdentifier: bob.publicIdentifier,
      timeout: "10000",
    });
    expect(channelRes.getError()).to.be.undefined;
    const channel = channelRes.getValue();
    expect(channel.channelAddress).to.be.ok;
    const aliceChannel = await alice.getStateChannel({ channelAddress: channel.channelAddress });
    const bobChannel = await bob.getStateChannel({ channelAddress: channel.channelAddress });
    expect(aliceChannel.getValue()).to.deep.eq(bobChannel.getValue());
  });

  it("alice can deposit ETH into channel", async () => {
    const assetId = constants.AddressZero;
    const depositAmt = utils.parseEther("0.01");
    const channelRes = await alice.getStateChannelByParticipants({
      alice: alice.publicIdentifier,
      bob: bob.publicIdentifier,
      chainId,
    });
    const channel = channelRes.getValue()!;

    let assetIdx = channel.assetIds.findIndex(_assetId => _assetId === assetId);
    const aliceBefore = assetIdx === -1 ? "0" : channel.balances[assetIdx].amount[0];

    const depositRes = await alice.deposit({
      chainId: channel.networkContext.chainId,
      amount: depositAmt.toString(),
      assetId,
      channelAddress: channel.channelAddress,
    });
    expect(depositRes.getError()).to.be.undefined;
    const deposit = depositRes.getValue();

    expect(deposit.channelAddress).to.be.a("string");

    const aliceChannel = (await alice.getStateChannel({ channelAddress: channel.channelAddress })).getValue()!;
    const bobChannel = (await bob.getStateChannel({ channelAddress: channel.channelAddress })).getValue()!;

    assetIdx = aliceChannel.assetIds.findIndex(_assetId => _assetId === assetId);
    const aliceAfter = aliceChannel.balances[assetIdx].amount[0];
    expect(aliceChannel).to.deep.eq(bobChannel);

    expect(aliceAfter).to.eq(BigNumber.from(aliceBefore).add(depositAmt));
  });

  it("bob can deposit ETH into channel", async () => {
    const assetId = constants.AddressZero;
    const depositAmt = utils.parseEther("0.01");
    const channelRes = await bob.getStateChannelByParticipants({
      alice: alice.publicIdentifier,
      bob: bob.publicIdentifier,
      chainId,
    });
    const channel = channelRes.getValue()!;

    let assetIdx = channel.assetIds.findIndex(_assetId => _assetId === assetId);
    const bobBefore = assetIdx === -1 ? "0" : channel.balances[assetIdx].amount[1];

    const depositRes = await bob.deposit({
      chainId: channel.networkContext.chainId,
      amount: depositAmt.toString(),
      assetId,
      channelAddress: channel.channelAddress,
    });
    const deposit = depositRes.getValue();

    expect(deposit.channelAddress).to.be.a("string");

    const aliceChannel = (await alice.getStateChannel({ channelAddress: channel.channelAddress })).getValue()!;
    const bobChannel = (await bob.getStateChannel({ channelAddress: channel.channelAddress })).getValue()!;

    assetIdx = bobChannel.assetIds.findIndex(_assetId => _assetId === assetId);
    const bobAfter = bobChannel.balances[assetIdx].amount[1];
    expect(aliceChannel).to.deep.eq(bobChannel);

    expect(BigNumber.from(bobBefore).add(depositAmt)).to.eq(bobAfter);
  });

  it("alice can transfer to bob and resolve the transfer", async () => {
    const assetId = constants.AddressZero;
    const transferAmt = utils.parseEther("0.005");
    const channelRes = await alice.getStateChannelByParticipants({
      alice: alice.publicIdentifier,
      bob: bob.publicIdentifier,
      chainId,
    });
    const channel = channelRes.getValue()!;

    const assetIdx = channel.assetIds.findIndex(_assetId => _assetId === assetId);
    const aliceBefore = assetIdx === -1 ? "0" : channel.balances[assetIdx].amount[0];
    const bobBefore = assetIdx === -1 ? "0" : channel.balances[assetIdx].amount[1];

    const preImage = getRandomBytes32();
    const linkedHash = utils.soliditySha256(["bytes32"], [preImage]);
    const transferRes = await alice.conditionalTransfer({
      amount: transferAmt.toString(),
      assetId,
      channelAddress: channel.channelAddress,
      conditionType: "LinkedTransfer",
      details: {
        linkedHash,
      },
    });
    expect(transferRes.getError()).to.not.be.ok;
    const { transferId } = transferRes.getValue()!;

    const channelAfterTransfer = (await alice.getStateChannel({ channelAddress: channel.channelAddress })).getValue()!;
    const aliceAfterTransfer = assetIdx === -1 ? "0" : channelAfterTransfer.balances[assetIdx].amount[0];
    expect(aliceAfterTransfer).to.be.eq(BigNumber.from(aliceBefore).sub(transferAmt));

    const resolveRes = await bob.resolveTransfer({
      channelAddress: channel.channelAddress,
      conditionType: "LinkedTransfer",
      details: {
        preImage,
      },
      transferId,
    });
    expect(resolveRes.getError()).to.not.be.ok;

    const channelAfterResolve = (await alice.getStateChannel({ channelAddress: channel.channelAddress })).getValue()!;
    const bobAfterResolve = assetIdx === -1 ? "0" : channelAfterResolve.balances[assetIdx].amount[1];
    expect(bobAfterResolve).to.be.eq(BigNumber.from(bobBefore).add(transferAmt));
  });

  it("bob can transfer to alice", async () => {
    const assetId = constants.AddressZero;
    const transferAmt = utils.parseEther("0.005");
    const channelRes = await alice.getStateChannelByParticipants({
      alice: alice.publicIdentifier,
      bob: bob.publicIdentifier,
      chainId,
    });
    const channel = channelRes.getValue()!;

    const assetIdx = channel.assetIds.findIndex(_assetId => _assetId === assetId);

    const preImage = getRandomBytes32();
    const linkedHash = utils.soliditySha256(["bytes32"], [preImage]);
    const transferRes = await bob.conditionalTransfer({
      amount: transferAmt.toString(),
      assetId,
      channelAddress: channel.channelAddress,
      conditionType: "LinkedTransfer",
      details: {
        linkedHash,
      },
    });
    expect(transferRes.isError).to.not.be.ok;

    const channelAfterTransfer = (await alice.getStateChannel({ channelAddress: channel.channelAddress })).getValue()!;
    const aliceAfterTransfer = assetIdx === -1 ? "0" : channelAfterTransfer.balances[assetIdx].amount[0];
  });

  it("alice can withdraw eth successfully to signer address", async () => {
    // Get test constants
    const assetId = constants.AddressZero;
    const withdrawalAmount = utils.parseEther("0.005");
    const channelRes = await alice.getStateChannelByParticipants({
      alice: alice.publicIdentifier,
      bob: bob.publicIdentifier,
      chainId,
    });
    const channel = channelRes.getValue()!;
    const assetIdx = channel.assetIds.findIndex(_assetId => _assetId === assetId);
    const [preWithdrawAlice, preWithdrawBob] = channel.balances[assetIdx].amount;
    const preWithdrawMultisig = await provider.getBalance(channel.channelAddress);
    const preWithdrawWallet = await provider.getBalance(alice.signerAddress);

    // Try alice withdrawal
    const withdrawalRes = await alice.withdraw({
      channelAddress: channel.channelAddress,
      amount: withdrawalAmount.toString(),
      assetId,
      recipient: alice.signerAddress,
      fee: "0",
      meta: { reason: "Alice reclaiming" },
    });
    expect(withdrawalRes.getError()).to.be.undefined;
    const { transactionHash } = withdrawalRes.getValue()!;
    expect(transactionHash).to.be.ok;

    // Assert in-channel changes
    const postWithdrawChannel = (await alice.getStateChannel({ channelAddress: channel.channelAddress })).getValue()!;
    const [postWithdrawAlice, postWithdrawBob] = postWithdrawChannel.balances[assetIdx].amount;
    expect(postWithdrawAlice).to.be.eq(BigNumber.from(preWithdrawAlice).sub(withdrawalAmount));
    expect(postWithdrawBob).to.be.eq(preWithdrawBob);

    // Assert onchain changes
    const postWithdrawMultisig = await provider.getBalance(channel.channelAddress);
    const postWithdrawWallet = await provider.getBalance(alice.signerAddress);
    expect(postWithdrawMultisig).to.be.eq(preWithdrawMultisig.sub(withdrawalAmount));
    // Alice submits txs herself, so you cannot check equalities
    // Instead, check that the wallet balance increased by no
    // more than the withdrawal amount
    const diff = postWithdrawWallet.sub(preWithdrawWallet);
    expect(diff.lte(withdrawalAmount)).to.be.true;
  });

  it("bob can successfully withdraw from channel to external recipient", async () => {
    // Get test constants
    const assetId = constants.AddressZero;
    const withdrawalAmount = utils.parseEther("0.005");
    const recipient = Wallet.createRandom().address;
    const channelRes = await bob.getStateChannelByParticipants({
      alice: alice.publicIdentifier,
      bob: bob.publicIdentifier,
      chainId,
    });
    const channel = channelRes.getValue()!;
    const assetIdx = channel.assetIds.findIndex(_assetId => _assetId === assetId);
    const [preWithdrawAlice, preWithdrawBob] = channel.balances[assetIdx].amount;
    const preWithdrawMultisig = await provider.getBalance(channel.channelAddress);

    // Try bob withdrawal
    const withdrawalRes = await bob.withdraw({
      channelAddress: channel.channelAddress,
      amount: withdrawalAmount.toString(),
      assetId,
      recipient,
      fee: "0",
      meta: { reason: "Bob withdrawing" },
    });
    expect(withdrawalRes.getError()).to.be.undefined;
    const { transactionHash } = withdrawalRes.getValue()!;
    expect(transactionHash).to.be.ok;

    // Assert in-channel changes
    const postWithdrawChannel = (await bob.getStateChannel({ channelAddress: channel.channelAddress })).getValue()!;
    const [postWithdrawAlice, postWithdrawBob] = postWithdrawChannel.balances[assetIdx].amount;
    expect(postWithdrawBob).to.be.eq(BigNumber.from(preWithdrawBob).sub(withdrawalAmount));
    expect(postWithdrawAlice).to.be.eq(preWithdrawAlice);

    // Assert onchain changes
    const postWithdrawMultisig = await provider.getBalance(channel.channelAddress);
    const postWithdrawRecipient = await provider.getBalance(recipient);
    expect(postWithdrawMultisig).to.be.eq(preWithdrawMultisig.sub(withdrawalAmount));
    expect(postWithdrawRecipient).to.be.eq(withdrawalAmount);
  });
});
