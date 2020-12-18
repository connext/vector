import { expect, getBalanceForAssetId, getRandomBytes32 } from "@connext/vector-utils";
import {
  DEFAULT_CHANNEL_TIMEOUT,
  EngineEvents,
  FullChannelState,
  INodeService,
  TransferNames,
} from "@connext/vector-types";
import { BigNumber, providers, utils, Wallet } from "ethers";

import { env } from "./env";
import { getOnchainBalance } from "./ethereum";

export const chainId1 = parseInt(Object.keys(env.chainProviders)[0]);
export const provider1 = new providers.JsonRpcProvider(env.chainProviders[chainId1]);
export const wallet1 = Wallet.fromMnemonic(env.sugarDaddy!).connect(provider1);

export const chainId2 = parseInt(Object.keys(env.chainProviders)[1]);
export let provider2: providers.Provider;
export let wallet2: Wallet;
if (chainId2) {
  provider2 = new providers.JsonRpcProvider(env.chainProviders[chainId2]);
  wallet2 = Wallet.fromMnemonic(env.sugarDaddy!).connect(provider2);
}

export const setup = async (
  bobService: INodeService,
  aliceService: INodeService,
  chainId: number,
): Promise<FullChannelState> => {
  const channelRes = await bobService.setup({
    counterpartyIdentifier: aliceService.publicIdentifier,
    chainId,
    timeout: DEFAULT_CHANNEL_TIMEOUT.toString(),
  });
  const channel = channelRes.getValue();
  expect(channel.channelAddress).to.be.ok;
  const bobChannel = await bobService.getStateChannel({
    channelAddress: channel.channelAddress,
    publicIdentifier: bobService.publicIdentifier,
  });
  const aliceChannel = await aliceService.getStateChannel({
    channelAddress: channel.channelAddress,
    publicIdentifier: aliceService.publicIdentifier,
  });
  expect(bobChannel.getValue()).to.deep.eq(aliceChannel.getValue());
  return bobChannel.getValue()! as FullChannelState;
};

export const deposit = async (
  depositor: INodeService,
  counterparty: INodeService,
  channelAddress: string,
  assetId: string,
  amount: BigNumber,
): Promise<FullChannelState> => {
  const channelRes = await depositor.getStateChannel({ channelAddress });
  const channel = channelRes.getValue()! as FullChannelState;

  const depositorAliceOrBob = depositor.publicIdentifier === channel.aliceIdentifier ? "alice" : "bob";
  const depositorBefore = getBalanceForAssetId(channel, assetId, depositorAliceOrBob);
  console.log("depositorBefore: ", depositorBefore);

  if (depositorAliceOrBob === "alice") {
    const tx = await depositor.sendDepositTx({
      amount: amount.toString(),
      assetId,
      chainId: chainId1,
      channelAddress,
      publicIdentifier: depositor.publicIdentifier,
    });
    await provider1.waitForTransaction(tx.getValue().txHash);
  } else {
    const tx = await wallet1.sendTransaction({ to: channel.channelAddress, value: amount });
    await tx.wait();
  }

  const depositRes = await depositor.reconcileDeposit({
    assetId,
    channelAddress: channel.channelAddress,
    publicIdentifier: depositor.publicIdentifier,
  });
  const deposit = depositRes.getValue();

  expect(deposit.channelAddress).to.be.a("string");

  const depositorChannel = (
    await depositor.getStateChannel({
      channelAddress: channel.channelAddress,
      publicIdentifier: depositor.publicIdentifier,
    })
  ).getValue()! as FullChannelState;
  const counterpartyChannel = (
    await counterparty.getStateChannel({
      channelAddress: channel.channelAddress,
      publicIdentifier: counterparty.publicIdentifier,
    })
  ).getValue()!;

  const depositorAfter = getBalanceForAssetId(depositorChannel, assetId, depositorAliceOrBob);
  expect(depositorChannel).to.deep.eq(counterpartyChannel);
  expect(BigNumber.from(depositorBefore).add(amount)).to.eq(depositorAfter);
  return depositorChannel;
};

export const transfer = async (
  sender: INodeService,
  receiver: INodeService,
  senderChannelAddress: string,
  receiverChannelAddress: string,
  senderAssetId: string,
  amount: BigNumber,
  receiverChainId?: number,
): Promise<{ senderChannel: FullChannelState; receiverChannel: FullChannelState }> => {
  const senderChannel = (
    await sender.getStateChannel({ channelAddress: senderChannelAddress })
  ).getValue()! as FullChannelState;
  const receiverChannel = (
    await receiver.getStateChannel({ channelAddress: receiverChannelAddress })
  ).getValue()! as FullChannelState;
  const senderAliceOrBob = sender.publicIdentifier === senderChannel.aliceIdentifier ? "alice" : "bob";
  const receiverAliceOrBob = receiver.publicIdentifier === receiverChannel.aliceIdentifier ? "alice" : "bob";
  const senderBefore = getBalanceForAssetId(senderChannel, senderAssetId, senderAliceOrBob);
  const receiverBefore = getBalanceForAssetId(receiverChannel, senderAssetId, receiverAliceOrBob);

  const preImage = getRandomBytes32();
  const lockHash = utils.soliditySha256(["bytes32"], [preImage]);
  const routingId = getRandomBytes32();

  const senderCreatePromise = sender.waitFor(EngineEvents.CONDITIONAL_TRANSFER_CREATED, 30_000);
  const receiverCreatePromise = receiver.waitFor(EngineEvents.CONDITIONAL_TRANSFER_CREATED, 30_000);
  const transferRes = await sender.conditionalTransfer({
    publicIdentifier: sender.publicIdentifier,
    amount: amount.toString(),
    assetId: senderAssetId,
    channelAddress: senderChannel.channelAddress,
    type: TransferNames.HashlockTransfer,
    details: {
      lockHash,
      expiry: "0",
    },
    meta: {
      routingId,
    },
    recipient: receiver.publicIdentifier,
    recipientChainId: receiverChainId,
  });
  expect(transferRes.getError()).to.not.be.ok;

  const senderChannelAfterTransfer = (
    await sender.getStateChannel({
      channelAddress: senderChannel.channelAddress,
      publicIdentifier: sender.publicIdentifier,
    })
  ).getValue()! as FullChannelState;
  const senderBalanceAfterTransfer = getBalanceForAssetId(senderChannelAfterTransfer, senderAssetId, senderAliceOrBob);
  expect(senderBalanceAfterTransfer).to.be.eq(BigNumber.from(senderBefore).sub(amount));
  const [senderCreate, receiverCreate] = await Promise.all([senderCreatePromise, receiverCreatePromise]);
  expect(senderCreate).to.be.ok;
  expect(receiverCreate).to.be.ok;

  const receiverTransferRes = await receiver.getTransferByRoutingId({
    channelAddress: receiverChannel.channelAddress,
    routingId,
    publicIdentifier: receiver.publicIdentifier,
  });

  expect(receiverTransferRes.getError()).to.not.be.ok;
  const receiverTransfer = receiverTransferRes.getValue()!;

  const receiverResolvePromise = receiver.waitFor(EngineEvents.CONDITIONAL_TRANSFER_RESOLVED, 30_000);
  const resolveRes = await receiver.resolveTransfer({
    publicIdentifier: receiver.publicIdentifier,
    channelAddress: receiverChannel.channelAddress,
    transferResolver: {
      preImage,
    },
    transferId: receiverTransfer.transferId,
  });
  expect(resolveRes.getError()).to.not.be.ok;
  const receiverResolve = await receiverResolvePromise;
  expect(receiverResolve).to.be.ok;

  const receiverChannelAfterResolve = (
    await receiver.getStateChannel({
      channelAddress: receiverChannel.channelAddress,
      publicIdentifier: receiver.publicIdentifier,
    })
  ).getValue()! as FullChannelState;

  const daveAfterResolve = getBalanceForAssetId(receiverChannelAfterResolve, senderAssetId, receiverAliceOrBob);
  expect(daveAfterResolve).to.be.eq(BigNumber.from(receiverBefore).add(amount));
  return { senderChannel: senderChannelAfterTransfer, receiverChannel: receiverChannelAfterResolve };
};

export const withdraw = async (
  withdrawer: INodeService,
  channelAddress: string,
  assetId: string,
  amount: BigNumber,
  withdrawRecipient: string,
): Promise<FullChannelState> => {
  // Get pre-withdraw channel balances
  const preWithdrawChannel = (await withdrawer.getStateChannel({ channelAddress })).getValue() as FullChannelState;
  const withdrawerAliceOrBob = withdrawer.publicIdentifier === preWithdrawChannel.aliceIdentifier ? "alice" : "bob";

  const provider = preWithdrawChannel.networkContext.chainId === chainId1 ? provider1 : provider2;

  const preWithdrawCarol = getBalanceForAssetId(preWithdrawChannel, assetId, withdrawerAliceOrBob);
  const preWithdrawMultisig = await getOnchainBalance(assetId, preWithdrawChannel.channelAddress, provider);
  const preWithdrawRecipient = await getOnchainBalance(assetId, withdrawRecipient, provider);

  // TODO: wait for these?
  withdrawer.on(EngineEvents.WITHDRAWAL_CREATED, (data) => {
    console.log("EngineEvents.WITHDRAWAL_CREATED ===> data: ", JSON.stringify(data, null, 2));
  });

  withdrawer.on(EngineEvents.WITHDRAWAL_RECONCILED, (data) => {
    console.log("EngineEvents.WITHDRAWAL_RECONCILED ===> data: ", JSON.stringify(data, null, 2));
  });

  withdrawer.on(EngineEvents.WITHDRAWAL_RESOLVED, (data) => {
    console.log("EngineEvents.WITHDRAWAL_RESOLVED ===> data: ", JSON.stringify(data, null, 2));
  });

  // Perform withdrawal
  const withdrawalRes = await withdrawer.withdraw({
    publicIdentifier: withdrawer.publicIdentifier,
    channelAddress,
    amount: amount.toString(),
    assetId,
    recipient: withdrawRecipient,
    fee: "0",
    meta: { reason: "Test withdrawal" },
  });
  expect(withdrawalRes.getError()).to.be.undefined;
  const { transactionHash } = withdrawalRes.getValue()!;
  expect(transactionHash).to.be.ok;
  await provider.waitForTransaction(transactionHash!);

  const postWithdrawChannel = (await withdrawer.getStateChannel({ channelAddress })).getValue()! as FullChannelState;
  const postWithdrawBalance = getBalanceForAssetId(postWithdrawChannel, assetId, withdrawerAliceOrBob);
  const postWithdrawMultisig = await getOnchainBalance(assetId, channelAddress, provider);
  const postWithdrawRecipient = await getOnchainBalance(assetId, withdrawRecipient, provider);

  // Verify balance changes
  expect(BigNumber.from(preWithdrawCarol).sub(amount)).to.be.eq(postWithdrawBalance);
  expect(postWithdrawMultisig).to.be.eq(BigNumber.from(preWithdrawMultisig).sub(amount));
  if (withdrawerAliceOrBob === "alice") {
    // use "above" because Alice sends withdrawal for Bob
    // TODO: calculate gas
    expect(postWithdrawRecipient).to.be.above(preWithdrawRecipient as any); // chai matchers arent getting this
  } else {
    expect(postWithdrawRecipient).to.be.eq(amount.add(preWithdrawRecipient));
  }
  return postWithdrawChannel;
};
