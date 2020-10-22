import { TransferNames, INodeService } from "@connext/vector-types";
import { getRandomBytes32, RestServerNodeService, expect } from "@connext/vector-utils";
import { Wallet, utils, constants, providers, BigNumber } from "ethers";
import pino from "pino";

import { env, getRandomIndex } from "../utils";

const chainId = parseInt(Object.keys(env.chainProviders)[0]);
const provider = new providers.JsonRpcProvider(env.chainProviders[chainId]);
const wallet = Wallet.fromMnemonic(env.sugarDaddy!).connect(provider);

const logger = pino({ level: env.logLevel });
const testName = "Duet Happy";

describe(testName, () => {
  let aliceService: INodeService;
  let aliceIdentifier: string;
  let alice: string;

  let bobService: INodeService;
  let bobIdentifier: string;
  let bob: string;

  before(async () => {
    const randomIndex = getRandomIndex();
    aliceService = await RestServerNodeService.connect(
      env.aliceUrl,
      logger.child({ testName }),
      undefined,
      randomIndex,
    );
    aliceIdentifier = aliceService.publicIdentifier;
    alice = aliceService.signerAddress;
    const aliceTx = await wallet.sendTransaction({ to: alice, value: utils.parseEther("0.1") });
    await aliceTx.wait();

    bobService = await RestServerNodeService.connect(env.bobUrl, logger.child({ testName }), undefined, randomIndex);
    bobIdentifier = bobService.publicIdentifier;
    bob = bobService.signerAddress;

    const bobTx = await wallet.sendTransaction({ to: bob, value: utils.parseEther("0.1") });
    await bobTx.wait();
  });

  it("alice & bob should setup a channel", async () => {
    const channelRes = await bobService.setup({
      counterpartyIdentifier: aliceIdentifier,
      chainId,
      timeout: "360000",
    });
    expect(channelRes.getError()).to.be.undefined;
    const channel = channelRes.getValue();
    expect(channel.channelAddress).to.be.ok;
    const aliceChannel = await aliceService.getStateChannel({
      channelAddress: channel.channelAddress,
      publicIdentifier: aliceIdentifier,
    });
    const bobChannel = await bobService.getStateChannel({
      channelAddress: channel.channelAddress,
      publicIdentifier: bobIdentifier,
    });
    expect(aliceChannel.getValue()).to.deep.eq(bobChannel.getValue());
  });

  it("alice can deposit ETH into channel", async () => {
    const assetId = constants.AddressZero;
    const depositAmt = utils.parseEther("0.01");
    const channelRes = await aliceService.getStateChannelByParticipants({
      counterparty: bobIdentifier,
      chainId,
      publicIdentifier: aliceIdentifier,
    });
    const channel = channelRes.getValue()!;

    let assetIdx = channel.assetIds.findIndex(_assetId => _assetId === assetId);
    const aliceBefore = assetIdx === -1 ? "0" : channel.balances[assetIdx].amount[0];

    const depositTxRes = await aliceService.sendDepositTx({
      chainId: channel.networkContext.chainId,
      amount: depositAmt.toString(),
      assetId,
      channelAddress: channel.channelAddress,
      publicIdentifier: aliceIdentifier,
    });
    expect(depositTxRes.getError()).to.be.undefined;
    await provider.waitForTransaction(depositTxRes.getValue().txHash);

    const depositRes = await aliceService.reconcileDeposit({
      assetId,
      channelAddress: channel.channelAddress,
      publicIdentifier: aliceIdentifier,
    });
    expect(depositRes.getError()).to.be.undefined;
    const deposit = depositRes.getValue();

    expect(deposit.channelAddress).to.be.a("string");

    const aliceChannel = (
      await aliceService.getStateChannel({ channelAddress: channel.channelAddress, publicIdentifier: aliceIdentifier })
    ).getValue()!;
    const bobChannel = (
      await bobService.getStateChannel({ channelAddress: channel.channelAddress, publicIdentifier: bobIdentifier })
    ).getValue()!;

    assetIdx = aliceChannel.assetIds.findIndex(_assetId => _assetId === assetId);
    const aliceAfter = aliceChannel.balances[assetIdx].amount[0];
    expect(aliceChannel).to.deep.eq(bobChannel);

    expect(aliceAfter).to.eq(BigNumber.from(aliceBefore).add(depositAmt));
  });

  it("bob can deposit ETH into channel by sending to the channelAddress", async () => {
    const assetId = constants.AddressZero;
    const depositAmt = utils.parseEther("0.01");
    const channelRes = await bobService.getStateChannelByParticipants({
      counterparty: aliceIdentifier,
      chainId,
      publicIdentifier: bobIdentifier,
    });
    const channel = channelRes.getValue()!;

    let assetIdx = channel.assetIds.findIndex(_assetId => _assetId === assetId);
    const bobBefore = assetIdx === -1 ? "0" : channel.balances[assetIdx].amount[1];

    const tx = await wallet.sendTransaction({ to: channel.channelAddress, value: depositAmt });
    await tx.wait();

    const depositRes = await bobService.reconcileDeposit({
      assetId,
      channelAddress: channel.channelAddress,
      publicIdentifier: bobIdentifier,
    });
    const deposit = depositRes.getValue();

    expect(deposit.channelAddress).to.be.a("string");

    const aliceChannel = (
      await aliceService.getStateChannel({ channelAddress: channel.channelAddress, publicIdentifier: aliceIdentifier })
    ).getValue()!;
    const bobChannel = (
      await bobService.getStateChannel({ channelAddress: channel.channelAddress, publicIdentifier: bobIdentifier })
    ).getValue()!;

    assetIdx = bobChannel.assetIds.findIndex(_assetId => _assetId === assetId);
    const bobAfter = bobChannel.balances[assetIdx].amount[1];
    expect(aliceChannel).to.deep.eq(bobChannel);

    expect(BigNumber.from(bobBefore).add(depositAmt)).to.eq(bobAfter);
  });

  it("alice can transfer to bob and resolve the transfer", async () => {
    const assetId = constants.AddressZero;
    const transferAmt = utils.parseEther("0.005");
    const channelRes = await aliceService.getStateChannelByParticipants({
      counterparty: bobIdentifier,
      chainId,
      publicIdentifier: aliceIdentifier,
    });
    const channel = channelRes.getValue()!;

    const assetIdx = channel.assetIds.findIndex(_assetId => _assetId === assetId);
    const aliceBefore = assetIdx === -1 ? "0" : channel.balances[assetIdx].amount[0];
    const bobBefore = assetIdx === -1 ? "0" : channel.balances[assetIdx].amount[1];

    const preImage = getRandomBytes32();
    const lockHash = utils.soliditySha256(["bytes32"], [preImage]);
    const transferRes = await aliceService.conditionalTransfer({
      amount: transferAmt.toString(),
      assetId,
      channelAddress: channel.channelAddress,
      type: TransferNames.HashlockTransfer,
      details: {
        lockHash,
        expiry: "0",
      },
      publicIdentifier: aliceIdentifier,
    });
    expect(transferRes.getError()).to.not.be.ok;
    const { transferId } = transferRes.getValue()!;

    const channelAfterTransfer = (
      await aliceService.getStateChannel({ channelAddress: channel.channelAddress, publicIdentifier: aliceIdentifier })
    ).getValue()!;
    const aliceAfterTransfer = assetIdx === -1 ? "0" : channelAfterTransfer.balances[assetIdx].amount[0];
    expect(aliceAfterTransfer).to.be.eq(BigNumber.from(aliceBefore).sub(transferAmt));

    const resolveRes = await bobService.resolveTransfer({
      publicIdentifier: bobIdentifier,
      channelAddress: channel.channelAddress,
      transferResolver: {
        preImage,
      },
      transferId,
    });
    expect(resolveRes.getError()).to.not.be.ok;

    const channelAfterResolve = (
      await aliceService.getStateChannel({ publicIdentifier: aliceIdentifier, channelAddress: channel.channelAddress })
    ).getValue()!;
    const bobAfterResolve = assetIdx === -1 ? "0" : channelAfterResolve.balances[assetIdx].amount[1];
    expect(bobAfterResolve).to.be.eq(BigNumber.from(bobBefore).add(transferAmt));
  });

  it("bob can transfer to alice", async () => {
    const assetId = constants.AddressZero;
    const transferAmt = utils.parseEther("0.005");
    const channelRes = await aliceService.getStateChannelByParticipants({
      counterparty: bobIdentifier,
      chainId,
      publicIdentifier: aliceIdentifier,
    });
    const channel = channelRes.getValue()!;

    const assetIdx = channel.assetIds.findIndex(_assetId => _assetId === assetId);

    const preImage = getRandomBytes32();
    const lockHash = utils.soliditySha256(["bytes32"], [preImage]);
    const transferRes = await bobService.conditionalTransfer({
      publicIdentifier: bobIdentifier,
      amount: transferAmt.toString(),
      assetId,
      channelAddress: channel.channelAddress,
      type: TransferNames.HashlockTransfer,
      details: {
        lockHash,
        expiry: "0",
      },
    });
    expect(transferRes.isError).to.not.be.ok;

    const channelAfterTransfer = (
      await aliceService.getStateChannel({ channelAddress: channel.channelAddress, publicIdentifier: aliceIdentifier })
    ).getValue()!;
    const aliceAfterTransfer = assetIdx === -1 ? "0" : channelAfterTransfer.balances[assetIdx].amount[0];
  });

  it("alice can withdraw eth successfully to signer address", async () => {
    // Get test constants
    const assetId = constants.AddressZero;
    const withdrawalAmount = utils.parseEther("0.005");
    const channelRes = await aliceService.getStateChannelByParticipants({
      counterparty: bobIdentifier,
      chainId,
      publicIdentifier: aliceIdentifier,
    });
    const channel = channelRes.getValue()!;
    const assetIdx = channel.assetIds.findIndex(_assetId => _assetId === assetId);
    const [preWithdrawAlice, preWithdrawBob] = channel.balances[assetIdx].amount;
    const preWithdrawMultisig = await provider.getBalance(channel.channelAddress);
    const preWithdrawWallet = await provider.getBalance(alice);

    // Try alice withdrawal
    const withdrawalRes = await aliceService.withdraw({
      publicIdentifier: aliceIdentifier,
      channelAddress: channel.channelAddress,
      amount: withdrawalAmount.toString(),
      assetId,
      recipient: alice,
      fee: "0",
      meta: { reason: "Alice reclaiming" },
    });
    expect(withdrawalRes.getError()).to.be.undefined;
    const { transactionHash } = withdrawalRes.getValue()!;
    expect(transactionHash).to.be.ok;

    // Assert in-channel changes
    const postWithdrawChannel = (
      await aliceService.getStateChannel({ channelAddress: channel.channelAddress, publicIdentifier: aliceIdentifier })
    ).getValue()!;
    const [postWithdrawAlice, postWithdrawBob] = postWithdrawChannel.balances[assetIdx].amount;
    expect(postWithdrawAlice).to.be.eq(BigNumber.from(preWithdrawAlice).sub(withdrawalAmount));
    expect(postWithdrawBob).to.be.eq(preWithdrawBob);

    // Assert onchain changes
    const postWithdrawMultisig = await provider.getBalance(channel.channelAddress);
    const postWithdrawWallet = await provider.getBalance(alice);
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
    const channelRes = await bobService.getStateChannelByParticipants({
      counterparty: aliceIdentifier,
      chainId,
      publicIdentifier: bobIdentifier,
    });
    const channel = channelRes.getValue()!;
    const assetIdx = channel.assetIds.findIndex(_assetId => _assetId === assetId);
    const [preWithdrawAlice, preWithdrawBob] = channel.balances[assetIdx].amount;
    const preWithdrawMultisig = await provider.getBalance(channel.channelAddress);

    // Try bob withdrawal
    const withdrawalRes = await bobService.withdraw({
      publicIdentifier: bobIdentifier,
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
    const postWithdrawChannel = (
      await bobService.getStateChannel({ channelAddress: channel.channelAddress, publicIdentifier: bobIdentifier })
    ).getValue()!;
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
