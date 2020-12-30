import { FullChannelState, INodeService, Result, NodeResponses, IVectorChainReader } from "@connext/vector-types";
import { getBalanceForAssetId, getSignerAddressFromPublicIdentifier } from "@connext/vector-utils";
import { BigNumber } from "@ethersproject/bignumber";
import { BaseLogger } from "pino";

import { CollateralError } from "./errors";
import { getRebalanceProfile } from "./services/config";

/**
 * This function should be called before a transfer is created/forwarded.
 * It will ensure there is always sufficient collateral in the channel for
 * the router to forward along the payment.
 */
export const justInTimeCollateral = async (
  channel: FullChannelState,
  assetId: string,
  publicIdentifier: string,
  node: INodeService,
  chainReader: IVectorChainReader,
  logger: BaseLogger,
  transferAmount: string,
): Promise<Result<undefined | NodeResponses.Deposit, CollateralError>> => {
  // If there is sufficient balance in the channel to handle the transfer
  // amount, no need for collateralization
  const myBalance = getBalanceForAssetId(
    channel,
    assetId,
    publicIdentifier === channel.aliceIdentifier ? "alice" : "bob",
  );
  if (BigNumber.from(myBalance).gte(transferAmount)) {
    return Result.ok(undefined);
  }

  // Get profile information
  const profileRes = getRebalanceProfile(channel.networkContext.chainId, assetId);
  if (profileRes.isError) {
    return Result.fail(
      new CollateralError(CollateralError.reasons.UnableToGetRebalanceProfile, {
        channelAddress: channel.channelAddress,
        error: profileRes.getError()?.message,
        context: profileRes.getError()?.context,
      }),
    );
  }
  const profile = profileRes.getValue();
  const target = BigNumber.from(profile.target);
  return requestCollateral(
    channel,
    assetId,
    publicIdentifier,
    node,
    chainReader,
    logger,
    BigNumber.from(transferAmount).add(target).toString(),
  );
};

/**
 * This function should be called after a transfer is resolved to eiher
 * reclaim or add collateral to adjust the channel to `profile.target`
 */
export const adjustCollateral = async (
  channelAddress: string,
  assetId: string,
  publicIdentifier: string,
  node: INodeService,
  chainReader: IVectorChainReader,
  logger: BaseLogger,
): Promise<Result<undefined | NodeResponses.Withdraw | NodeResponses.Deposit, CollateralError>> => {
  // Get channel
  const channelRes = await node.getStateChannel({ publicIdentifier, channelAddress });
  if (channelRes.isError || !channelRes.getValue()) {
    return Result.fail(new CollateralError(CollateralError.reasons.ChannelNotFound, { channelAddress }));
  }
  const channel = channelRes.getValue() as FullChannelState;

  // Get profile information
  const profileRes = getRebalanceProfile(channel.networkContext.chainId, assetId);
  if (profileRes.isError) {
    return Result.fail(
      new CollateralError(CollateralError.reasons.UnableToGetRebalanceProfile, {
        channelAddress: channel.channelAddress,
        error: profileRes.getError()?.message,
        context: profileRes.getError()?.context,
      }),
    );
  }
  const profile = profileRes.getValue();
  const target = BigNumber.from(profile.target);
  const collateralizeThreshold = BigNumber.from(profile.collateralizeThreshold);
  const reclaimThreshold = BigNumber.from(profile.reclaimThreshold);

  // Get channel balance
  const iAmAlice = publicIdentifier === channel.aliceIdentifier;
  const myBalance = BigNumber.from(getBalanceForAssetId(channel, assetId, iAmAlice ? "alice" : "bob"));

  // Establish needed action
  if (myBalance.gt(collateralizeThreshold) && myBalance.lte(reclaimThreshold)) {
    // Channel balance is within reason, nothing to do
    logger.debug({ myBalance, assetId, channel: channel.channelAddress }, "No collateral actions needed");
    return Result.ok(undefined);
  }

  if (myBalance.lte(collateralizeThreshold)) {
    // Must collateralize
    return requestCollateral(channel, assetId, publicIdentifier, node, chainReader, logger);
  }

  // balance should be above reclaim threshold, must reclaim
  const reclaimable = myBalance.sub(target);
  logger.info({ reclaimable: reclaimable.toString(), assetId, channelAddress }, "Reclaiming funds");

  // NOTE: would be interesting to find another channel that needs collateral
  // in this asset and set the withdrawal to just call `depositA` on that
  // channel's multisig

  const withdrawRes = await node.withdraw({
    publicIdentifier,
    assetId,
    channelAddress: channel.channelAddress,
    amount: reclaimable.toString(),
    recipient: getSignerAddressFromPublicIdentifier(publicIdentifier),
  });
  if (!withdrawRes.isError) {
    return withdrawRes as Result<NodeResponses.Withdraw>;
  }

  const withdrawalErr = withdrawRes.getError();
  return Result.fail(
    new CollateralError(CollateralError.reasons.UnableToReclaim, {
      assetId,
      channelAddress: channel.channelAddress,
      withdrawError: withdrawalErr?.message,
      withdrawContext: withdrawalErr?.context,
    }),
  );
};

/**
 * This function should be called when a deposit may need to be added to
 * the channel. Will bring the value up to the `requestedAmount`, or if not
 * provided the `profile.target`
 */
export const requestCollateral = async (
  channel: FullChannelState,
  assetId: string,
  publicIdentifier: string,
  node: INodeService,
  chainReader: IVectorChainReader,
  logger: BaseLogger,
  requestedAmount?: string,
): Promise<Result<undefined | NodeResponses.Deposit, CollateralError>> => {
  const profileRes = getRebalanceProfile(channel.networkContext.chainId, assetId);
  if (profileRes.isError) {
    return Result.fail(
      new CollateralError(CollateralError.reasons.UnableToGetRebalanceProfile, {
        channelAddress: channel.channelAddress,
        error: profileRes.getError()?.message,
        context: profileRes.getError()?.context,
      }),
    );
  }
  const profile = profileRes.getValue();
  if (requestedAmount && BigNumber.from(requestedAmount).gt(profile.reclaimThreshold)) {
    return Result.fail(
      new CollateralError(CollateralError.reasons.TargetHigherThanThreshold, {
        channelAddress: channel.channelAddress,
        profile,
        requestedAmount,
      }),
    );
  }

  const target = BigNumber.from(requestedAmount ?? profile.target);

  logger.info({ target: target.toString(), channel: channel.channelAddress, assetId }, "Collateral target calculated");

  const iAmAlice = publicIdentifier === channel.aliceIdentifier;

  const assetIdx = channel.assetIds.findIndex((assetId) => assetId === assetId);
  const myBalance = BigNumber.from(getBalanceForAssetId(channel, assetId, iAmAlice ? "alice" : "bob"));

  if (myBalance.gte(target)) {
    logger.info({ balance: channel.balances[assetIdx], target }, "Current balance is sufficient, not collateralizing");
    return Result.ok(undefined);
  }

  const providers = chainReader.getHydratedProviders();
  if (providers.isError) {
    return Result.fail(
      new CollateralError(CollateralError.reasons.ProviderNotFound, {
        channelAddress: channel.channelAddress,
        chainId: channel.networkContext.chainId,
        assetId,
        requestedAmount,
      }),
    );
  }
  const provider = providers.getValue()[channel.networkContext.chainId];
  if (!provider) {
    return Result.fail(
      new CollateralError(CollateralError.reasons.ProviderNotFound, {
        channelAddress: channel.channelAddress,
        chainId: channel.networkContext.chainId,
        assetId,
        requestedAmount,
      }),
    );
  }

  // Check if a tx has already been sent, but has not been reconciled
  // Get the total deposits vs. processed deposits
  const onchainProcessed = iAmAlice
    ? await chainReader.getTotalDepositedA(channel.channelAddress, channel.networkContext.chainId, assetId)
    : await chainReader.getTotalDepositedB(channel.channelAddress, channel.networkContext.chainId, assetId);
  if (onchainProcessed.isError) {
    return Result.fail(
      new CollateralError(CollateralError.reasons.CouldNotGetOnchainDeposits, {
        channelAddress: channel.channelAddress,
        error: onchainProcessed.getError()?.message,
        context: onchainProcessed.getError()?.context,
      }),
    );
  }
  const offchainProcessed = BigNumber.from(channel.processedDepositsA[assetIdx] ?? "0");
  const amountToDeposit = BigNumber.from(target).sub(myBalance);
  if (onchainProcessed.getValue().sub(offchainProcessed).lt(amountToDeposit)) {
    // Deposit needed
    logger.info({ amountToDeposit: amountToDeposit.toString() }, "Deposit amount calculated, submitting deposit tx");
    const txRes = await node.sendDepositTx({
      amount: amountToDeposit.toString(),
      assetId: assetId,
      chainId: channel.networkContext.chainId,
      channelAddress: channel.channelAddress,
      publicIdentifier,
    });
    if (txRes.isError) {
      return Result.fail(
        new CollateralError(CollateralError.reasons.TxError, {
          channelAddress: channel.channelAddress,
          error: txRes.getError()?.message,
          context: txRes.getError()?.context,
        }),
      );
    }

    const tx = txRes.getValue();
    logger.info({ txHash: tx.txHash }, "Submitted deposit tx");
    const receipt = await provider.waitForTransaction(tx.txHash);
    logger.info({ txHash: tx.txHash, logs: receipt.logs }, "Tx mined");
  }

  const params = {
    assetId: assetId,
    publicIdentifier,
    channelAddress: channel.channelAddress,
  };
  logger.info({ balance: channel.balances[assetIdx], target: target.toString() }, "Reconciling onchain funds");
  const depositRes = await node.reconcileDeposit(params);
  if (!depositRes.isError) {
    return depositRes as Result<NodeResponses.Deposit>;
  }
  const error = depositRes.getError()!;
  return Result.fail(
    new CollateralError(CollateralError.reasons.UnableToCollateralize, {
      channelAddress: channel.channelAddress,
      nodeError: error.message,
      context: error.context,
    }),
  );
};
