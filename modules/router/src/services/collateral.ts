import {
  FullChannelState,
  INodeService,
  Result,
  NodeResponses,
  IVectorChainReader,
  VectorError,
} from "@connext/vector-types";
import { getBalanceForAssetId, getRandomBytes32 } from "@connext/vector-utils";
import { BigNumber } from "@ethersproject/bignumber";
import { BaseLogger } from "pino";

import { CollateralError } from "../errors";

import { getRebalanceProfile } from "./config";

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
      new CollateralError(
        CollateralError.reasons.UnableToGetRebalanceProfile,
        channel.channelAddress,
        assetId,
        {} as any,
        undefined,
        {
          profileError: VectorError.jsonify(profileRes.getError()!),
          transferAmount,
        },
      ),
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
    return Result.fail(
      new CollateralError(CollateralError.reasons.ChannelNotFound, channelAddress, assetId, {} as any, undefined, {
        getChannelError: VectorError.jsonify(channelRes.getError()!),
      }),
    );
  }
  const channel = channelRes.getValue() as FullChannelState;

  // Get profile information
  const profileRes = getRebalanceProfile(channel.networkContext.chainId, assetId);
  if (profileRes.isError) {
    return Result.fail(
      new CollateralError(
        CollateralError.reasons.UnableToGetRebalanceProfile,
        channelAddress,
        assetId,
        {} as any,
        undefined,
        {
          profileError: VectorError.jsonify(profileRes.getError()!),
        },
      ),
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
    recipient: iAmAlice ? channel.alice : channel.bob,
  });
  if (!withdrawRes.isError) {
    return withdrawRes as Result<NodeResponses.Withdraw>;
  }

  const withdrawalErr = withdrawRes.getError();
  return Result.fail(
    new CollateralError(CollateralError.reasons.UnableToReclaim, channel.channelAddress, assetId, profile, undefined, {
      withdrawError: VectorError.jsonify(withdrawalErr!),
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
  const method = "requestCollateral";
  const methodId = getRandomBytes32();
  logger.debug({ method, methodId, assetId, publicIdentifier, channel }, "Started");
  const profileRes = getRebalanceProfile(channel.networkContext.chainId, assetId);
  if (profileRes.isError) {
    return Result.fail(
      new CollateralError(
        CollateralError.reasons.UnableToGetRebalanceProfile,
        channel.channelAddress,
        assetId,
        {} as any,
        requestedAmount,
        {
          profileError: VectorError.jsonify(profileRes.getError()!),
        },
      ),
    );
  }
  const profile = profileRes.getValue();

  const target = BigNumber.from(requestedAmount ?? profile.target);

  logger.info({ target: target.toString(), channel: channel.channelAddress, assetId }, "Collateral target calculated");

  const iAmAlice = publicIdentifier === channel.aliceIdentifier;

  const assetIdx = channel.assetIds.findIndex((assetId: string) => assetId === assetId);
  const myBalance = BigNumber.from(getBalanceForAssetId(channel, assetId, iAmAlice ? "alice" : "bob"));

  if (myBalance.gte(target)) {
    logger.info({ balance: channel.balances[assetIdx], target }, "Current balance is sufficient, not collateralizing");
    return Result.ok(undefined);
  }
  logger.info({ target: target.toString(), myBalance: myBalance.toString() }, "Adding collateral to channel");

  const providers = chainReader.getHydratedProviders();
  if (providers.isError) {
    return Result.fail(
      new CollateralError(
        CollateralError.reasons.ProviderNotFound,
        channel.channelAddress,
        assetId,
        profile,
        requestedAmount,
        {
          chainId: channel.networkContext.chainId,
        },
      ),
    );
  }
  const provider = providers.getValue()[channel.networkContext.chainId];
  if (!provider) {
    return Result.fail(
      new CollateralError(
        CollateralError.reasons.ProviderNotFound,
        channel.channelAddress,
        assetId,
        profile,
        requestedAmount,
        {
          chainId: channel.networkContext.chainId,
        },
      ),
    );
  }

  // Check if a tx has already been sent, but has not been reconciled
  // Get the total deposits vs. processed deposits
  const totalDeposited = iAmAlice
    ? await chainReader.getTotalDepositedA(channel.channelAddress, channel.networkContext.chainId, assetId)
    : await chainReader.getTotalDepositedB(channel.channelAddress, channel.networkContext.chainId, assetId);
  if (totalDeposited.isError) {
    return Result.fail(
      new CollateralError(
        CollateralError.reasons.CouldNotGetOnchainDeposits,
        channel.channelAddress,
        assetId,
        profile,
        requestedAmount,
        {
          chainError: VectorError.jsonify(totalDeposited.getError()!),
        },
      ),
    );
  }
  const processed = iAmAlice ? channel.processedDepositsA[assetIdx] : channel.processedDepositsB[assetIdx];
  const amountToDeposit = BigNumber.from(target).sub(myBalance);
  const reconcilable = totalDeposited.getValue().sub(processed ?? "0");
  if (reconcilable.lt(amountToDeposit)) {
    // Deposit needed
    logger.info(
      { amountToDeposit: amountToDeposit.toString(), target: target.toString() },
      "Deposit amount calculated, submitting deposit tx",
    );
    const txRes = await node.sendDepositTx({
      amount: amountToDeposit.toString(),
      assetId: assetId,
      chainId: channel.networkContext.chainId,
      channelAddress: channel.channelAddress,
      publicIdentifier,
    });
    if (txRes.isError) {
      return Result.fail(
        new CollateralError(
          CollateralError.reasons.TxError,
          channel.channelAddress,
          assetId,
          profile,
          requestedAmount,
          {
            error: VectorError.jsonify(txRes.getError()!),
            amountToDeposit: amountToDeposit.toString(),
          },
        ),
      );
    }

    const tx = txRes.getValue();
    logger.info({ txHash: tx.txHash }, "Submitted deposit tx");
    const receipt = await provider.waitForTransaction(tx.txHash);
    logger.info({ txHash: tx.txHash, logs: receipt.logs }, "Tx mined");
  } else {
    logger.info(
      {
        processed: processed.toString(),
        amountToDeposit: amountToDeposit.toString(),
        reconcilable: reconcilable.toString(),
        target: target.toString(),
      },
      "Owed onchain funds are sufficient",
    );
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
    new CollateralError(
      CollateralError.reasons.UnableToCollateralize,
      channel.channelAddress,
      assetId,
      profile,
      requestedAmount,
      {
        nodeError: VectorError.jsonify(error),
      },
    ),
  );
};
