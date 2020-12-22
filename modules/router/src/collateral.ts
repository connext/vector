import { FullChannelState, INodeService, Result, NodeResponses, IVectorChainReader } from "@connext/vector-types";
import { getBalanceForAssetId } from "@connext/vector-utils";
import { BigNumber } from "@ethersproject/bignumber";
import { BaseLogger } from "pino";

import { RequestCollateralError } from "./errors";
import { getRebalanceProfile } from "./services/config";

export const requestCollateral = async (
  channel: FullChannelState,
  assetId: string,
  publicIdentifier: string,
  node: INodeService,
  chainReader: IVectorChainReader,
  logger: BaseLogger,
  requestedAmount?: string,
  transferAmount?: string, // used when called internally
): Promise<Result<undefined | NodeResponses.Deposit, RequestCollateralError>> => {
  const profileRes = getRebalanceProfile(channel.networkContext.chainId, assetId);
  if (profileRes.isError) {
    return Result.fail(
      new RequestCollateralError(RequestCollateralError.reasons.UnableToGetRebalanceProfile, {
        channelAddress: channel.channelAddress,
        error: profileRes.getError()?.message,
        context: profileRes.getError()?.context,
      }),
    );
  }
  const profile = profileRes.getValue();
  if (requestedAmount && BigNumber.from(requestedAmount).gt(profile.reclaimThreshold)) {
    return Result.fail(
      new RequestCollateralError(RequestCollateralError.reasons.TargetHigherThanThreshold, {
        channelAddress: channel.channelAddress,
        profile,
        requestedAmount,
      }),
    );
  }

  let target = BigNumber.from(requestedAmount || profile.target);
  if (transferAmount) {
    target = target.add(transferAmount);
  }

  logger.info({ target: target.toString(), requestedAmount, profile, transferAmount }, "Collateral target calculated");

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
      new RequestCollateralError(RequestCollateralError.reasons.ProviderNotFound, {
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
      new RequestCollateralError(RequestCollateralError.reasons.ProviderNotFound, {
        channelAddress: channel.channelAddress,
        chainId: channel.networkContext.chainId,
        assetId,
        requestedAmount,
      }),
    );
  }
  console.log("***** provider", provider);

  // Check if a tx has already been sent, but has not been reconciled
  // Get the total deposits vs. processed deposits
  const onchainProcessed = iAmAlice
    ? await chainReader.getTotalDepositedA(channel.channelAddress, channel.networkContext.chainId, assetId)
    : await chainReader.getTotalDepositedB(channel.channelAddress, channel.networkContext.chainId, assetId);
  if (onchainProcessed.isError) {
    return Result.fail(
      new RequestCollateralError(RequestCollateralError.reasons.CouldNotGetOnchainDeposits, {
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
        new RequestCollateralError(RequestCollateralError.reasons.TxError, {
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
    new RequestCollateralError(RequestCollateralError.reasons.UnableToCollateralize, {
      channelAddress: channel.channelAddress,
      nodeError: error.message,
      context: error.context,
    }),
  );
};
