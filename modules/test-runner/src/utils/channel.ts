import { delay, expect, getBalanceForAssetId, getRandomBytes32, getParticipant } from "@connext/vector-utils";
import {
  DEFAULT_CHANNEL_TIMEOUT,
  EngineEvents,
  FullChannelState,
  INodeService,
  Result,
  TransferNames,
  TransferQuote,
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

export const requestCollateral = async (
  requester: INodeService,
  counterparty: INodeService,
  channelAddress: string,
  assetId: string,
  requestedAmount?: BigNumber,
): Promise<FullChannelState> => {
  const channelRes = await requester.getStateChannel({ channelAddress });
  const channel = channelRes.getValue()! as FullChannelState;

  const counterpartyAliceOrBob = getParticipant(channel, counterparty.publicIdentifier);
  if (!counterpartyAliceOrBob) {
    throw new Error("Invalid participant");
  }
  const counterpartyBefore = getBalanceForAssetId(channel, assetId, counterpartyAliceOrBob);

  const collateralRes = await requester.requestCollateral({
    assetId,
    channelAddress,
    publicIdentifier: requester.publicIdentifier,
    amount: !!requestedAmount ? requestedAmount?.toString() : undefined,
  });
  expect(collateralRes.getError()).to.be.undefined;
  const collateral = collateralRes.getValue();
  expect(collateral).to.be.deep.eq({ channelAddress });

  // wait for reconciliation
  await delay(2000);

  const requesterChannel = (
    await requester.getStateChannel({
      channelAddress: channel.channelAddress,
      publicIdentifier: requester.publicIdentifier,
    })
  ).getValue()! as FullChannelState;
  const counterpartyChannel = (
    await counterparty.getStateChannel({
      channelAddress: channel.channelAddress,
      publicIdentifier: counterparty.publicIdentifier,
    })
  ).getValue()!;

  const counterpartyAfter = getBalanceForAssetId(requesterChannel, assetId, counterpartyAliceOrBob);
  expect(requesterChannel).to.deep.eq(counterpartyChannel);
  if (requestedAmount && requestedAmount.lte(counterpartyBefore)) {
    // should not collateralize
    expect(BigNumber.from(counterpartyAfter).eq(counterpartyBefore)).to.be.true;
    return requesterChannel;
  }
  const min = BigNumber.from(requestedAmount ?? counterpartyBefore);
  expect(BigNumber.from(counterpartyAfter).gte(counterpartyBefore)).to.be.true;
  expect(BigNumber.from(counterpartyAfter).gte(min)).to.be.true;
  return requesterChannel;
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

  const depositorAliceOrBob = getParticipant(channel, depositor.publicIdentifier);
  if (!depositorAliceOrBob) {
    throw new Error("Invalid participant");
  }
  const depositorBefore = getBalanceForAssetId(channel, assetId, depositorAliceOrBob);

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
): Promise<{ senderChannel: FullChannelState; receiverChannel: FullChannelState; transferQuote: TransferQuote }> => {
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

  // Generate transfer params
  const params = {
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
  };

  // Get transfer quote
  const transferInChannel =
    (senderAliceOrBob === "bob" && receiver.publicIdentifier === senderChannel.aliceIdentifier) ||
    (senderAliceOrBob === "alice" && receiver.publicIdentifier === senderChannel.bobIdentifier);
  const quote = transferInChannel
    ? Result.ok({
        signature: undefined,
        chainId: senderChannel.networkContext.chainId,
        routerIdentifier: sender.publicIdentifier,
        amount: params.amount,
        assetId: params.assetId,
        recipient: receiver.publicIdentifier,
        recipientChainId: senderChannel.networkContext.chainId,
        recipientAssetId: senderAssetId,
        fee: "0",
        expiry: (Date.now() + 30_000).toString(),
      })
    : await sender.getTransferQuote({
        amount: params.amount,
        assetId: params.assetId,
        chainId: senderChannel.networkContext.chainId,
        routerIdentifier: senderChannel.aliceIdentifier,
        recipient: params.recipient,
        recipientChainId: params.recipientChainId,
      });
  expect(quote.getError()).to.not.be.ok;
  const amountForwarded = amount.sub(quote.getValue().fee);

  const senderCreatePromise = sender.waitFor(EngineEvents.CONDITIONAL_TRANSFER_CREATED, 30_000);
  const receiverCreatePromise = receiver.waitFor(EngineEvents.CONDITIONAL_TRANSFER_CREATED, 30_000);
  const transferRes = await sender.conditionalTransfer(params);
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
  expect(senderCreate?.transfer.balance.amount).to.be.deep.eq([amount.toString(), "0"]);
  expect(receiverCreate?.transfer.balance.amount).to.be.deep.eq([amountForwarded.toString(), "0"]);

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
  expect(receiverResolve?.transfer.balance.amount).to.be.deep.eq(["0", amountForwarded.toString()]);

  const receiverChannelAfterResolve = (
    await receiver.getStateChannel({
      channelAddress: receiverChannel.channelAddress,
      publicIdentifier: receiver.publicIdentifier,
    })
  ).getValue()! as FullChannelState;

  const daveAfterResolve = getBalanceForAssetId(receiverChannelAfterResolve, senderAssetId, receiverAliceOrBob);
  expect(daveAfterResolve).to.be.eq(BigNumber.from(receiverBefore).add(amountForwarded));
  return {
    senderChannel: senderChannelAfterTransfer,
    receiverChannel: receiverChannelAfterResolve,
    transferQuote: quote.getValue(),
  };
};

export const withdraw = async (
  withdrawer: INodeService,
  channelAddress: string,
  assetId: string,
  amount: BigNumber,
  withdrawRecipient: string,
  initiatorSubmits: boolean = false,
): Promise<FullChannelState> => {
  // Get pre-withdraw channel balances
  const preWithdrawChannel = (await withdrawer.getStateChannel({ channelAddress })).getValue() as FullChannelState;
  const withdrawerAliceOrBob = withdrawer.publicIdentifier === preWithdrawChannel.aliceIdentifier ? "alice" : "bob";

  const provider = preWithdrawChannel.networkContext.chainId === chainId1 ? provider1 : provider2;

  const preWithdrawCarol = getBalanceForAssetId(preWithdrawChannel, assetId, withdrawerAliceOrBob);
  const preWithdrawMultisig = await getOnchainBalance(assetId, preWithdrawChannel.channelAddress, provider);
  const preWithdrawRecipient = await getOnchainBalance(assetId, withdrawRecipient, provider);

  // Get withdrawal quote
  const quote = await withdrawer.getWithdrawalQuote({
    amount: amount.toString(),
    assetId,
    channelAddress,
  });
  expect(quote.getError()).to.not.be.ok;
  const amountWithdrawn = amount.sub(initiatorSubmits ? 0 : quote.getValue().fee);

  // Perform withdrawal
  const baseParams = {
    publicIdentifier: withdrawer.publicIdentifier,
    channelAddress,
    amount: amount.toString(),
    assetId,
    recipient: withdrawRecipient,
    meta: { reason: "Test withdrawal" },
  };
  const withdrawParams = initiatorSubmits ? { ...baseParams, initiatorSubmits } : { ...baseParams };
  const withdrawalRes = await withdrawer.withdraw(withdrawParams);
  expect(withdrawalRes.getError()).to.be.undefined;
  if (initiatorSubmits) {
    const { transaction } = withdrawalRes.getValue();
    expect(transaction).to.be.ok;
    console.log("transaction", transaction);
    // submit to chain
    const tx = await wallet1.sendTransaction({ to: transaction!.to, value: 0, data: transaction!.data });
    await tx.wait();
  } else {
    const { transactionHash } = withdrawalRes.getValue()!;
    expect(transactionHash).to.be.ok;
    await provider.waitForTransaction(transactionHash!);
  }

  const postWithdrawChannel = (await withdrawer.getStateChannel({ channelAddress })).getValue()! as FullChannelState;
  const postWithdrawBalance = getBalanceForAssetId(postWithdrawChannel, assetId, withdrawerAliceOrBob);
  const postWithdrawMultisig = await getOnchainBalance(assetId, channelAddress, provider);
  const postWithdrawRecipient = await getOnchainBalance(assetId, withdrawRecipient, provider);

  // Verify balance changes
  console.log("asserting in-channel change");
  expect(BigNumber.from(preWithdrawCarol).sub(amount)).to.be.eq(postWithdrawBalance);
  // using gte here because roger could collateralize
  expect(postWithdrawMultisig.gte(BigNumber.from(preWithdrawMultisig).sub(amountWithdrawn))).to.be.true;
  if (withdrawerAliceOrBob === "alice") {
    // use "above" because Alice sends withdrawal for Bob
    // TODO: calculate gas
    expect(postWithdrawRecipient).to.be.above(preWithdrawRecipient as any); // chai matchers arent getting this
  } else {
    console.log("asserting recipient balance");
    expect(postWithdrawRecipient).to.be.eq(amountWithdrawn.add(preWithdrawRecipient));
  }
  return postWithdrawChannel;
};
