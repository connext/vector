import {
  FullChannelState,
  INodeService,
  Result,
  NodeResponses,
  IVectorChainReader,
  jsonifyError,
} from "@connext/vector-types";
import { getBalanceForAssetId, getRandomBytes32, getParticipant } from "@connext/vector-utils";
import { waitForTransaction } from "@connext/vector-contracts";
import { getAddress } from "@ethersproject/address";
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
  channelAddress: string,
  assetId: string,
  publicIdentifier: string,
  node: INodeService,
  chainReader: IVectorChainReader,
  logger: BaseLogger,
  transferAmount: string,
): Promise<Result<undefined | NodeResponses.Deposit, CollateralError>> => {
  const method = "justInTimeCollateral";
  const methodId = getRandomBytes32();
  logger.info({ method, methodId, channelAddress, assetId, transferAmount }, "Method started");
  // pull from store
  // because this is a "justInTime" method, you must make sure you are using
  // the source of truth to judge if collateral is needed
  const channelRes = await node.getStateChannel({ channelAddress });
  if (channelRes.isError || !channelRes.getValue()) {
    return Result.fail(
      new CollateralError(CollateralError.reasons.ChannelNotFound, channelAddress, assetId, {} as any, undefined, {
        getChannelError: channelRes.isError ? jsonifyError(channelRes.getError()!) : "Channel not found",
      }),
    );
  }
  const channel = channelRes.getValue() as FullChannelState;
  // If there is sufficient balance in the channel to handle the transfer
  // amount, no need for collateralization
  const participant = getParticipant(channel, publicIdentifier);
  if (!participant) {
    return Result.fail(
      new CollateralError(
        CollateralError.reasons.NotInChannel,
        channel.channelAddress,
        assetId,
        {} as any,
        transferAmount,
        { publicIdentifier, alice: channel.aliceIdentifier, bob: channel.bobIdentifier },
      ),
    );
  }
  const myBalance = getBalanceForAssetId(channel, assetId, participant);
  if (BigNumber.from(myBalance).gte(transferAmount)) {
    logger.info(
      { method, methodId, channelAddress: channel.channelAddress, balance: myBalance.toString(), transferAmount },
      "Balance is sufficient, not collateralizing",
    );
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
          profileError: jsonifyError(profileRes.getError()!),
          transferAmount,
        },
      ),
    );
  }
  const profile = profileRes.getValue();
  const target = BigNumber.from(profile.target);
  const res = await requestCollateral(
    channel,
    assetId,
    publicIdentifier,
    node,
    chainReader,
    logger,
    BigNumber.from(transferAmount).add(target).toString(),
  );
  logger.info({ method, methodId }, "Method complete");
  return res;
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
  const method = "adjustCollateral";
  const methodId = getRandomBytes32();
  logger.debug({ method, methodId, channelAddress, assetId }, "Method started");
  // Get channel
  const channelRes = await node.getStateChannel({ publicIdentifier, channelAddress });
  if (channelRes.isError || !channelRes.getValue()) {
    return Result.fail(
      new CollateralError(CollateralError.reasons.ChannelNotFound, channelAddress, assetId, {} as any, undefined, {
        getChannelError: jsonifyError(channelRes.getError()!),
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
          profileError: jsonifyError(profileRes.getError()!),
        },
      ),
    );
  }
  const profile = profileRes.getValue();
  const target = BigNumber.from(profile.target);
  const collateralizeThreshold = BigNumber.from(profile.collateralizeThreshold);
  const reclaimThreshold = BigNumber.from(profile.reclaimThreshold);

  // Get channel balance
  const participant = getParticipant(channel, publicIdentifier);
  if (!participant) {
    return Result.fail(
      new CollateralError(CollateralError.reasons.NotInChannel, channel.channelAddress, assetId, profile, undefined, {
        publicIdentifier,
        alice: channel.aliceIdentifier,
        bob: channel.bobIdentifier,
      }),
    );
  }
  const myBalance = BigNumber.from(getBalanceForAssetId(channel, assetId, participant));

  // Establish needed action
  if (myBalance.gt(collateralizeThreshold) && myBalance.lte(reclaimThreshold)) {
    // Channel balance is within reason, nothing to do
    logger.info({ myBalance: myBalance.toString(), assetId, channelAddress }, "No collateral actions needed");
    return Result.ok(undefined);
  }

  if (myBalance.lte(collateralizeThreshold)) {
    logger.info(
      {
        method,
        methodId,
        channelAddress,
        assetId,
        myBalance: myBalance.toString(),
        collateralizeThreshold: profile.collateralizeThreshold,
      },
      "Adding collateral",
    );
    // Must collateralize
    return requestCollateral(channel, assetId, publicIdentifier, node, chainReader, logger);
  }

  // balance should be above reclaim threshold, must reclaim
  const reclaimable = myBalance.sub(target);
  if (reclaimable.eq(0)) {
    logger.info({ assetId, channelAddress }, "Nothing to reclaim");
    return Result.ok(undefined);
  }
  logger.info({ reclaimable: reclaimable.toString(), assetId, channelAddress }, "Reclaiming funds");

  // NOTE: would be interesting to find another channel that needs collateral
  // in this asset and set the withdrawal to just call `depositA` on that
  // channel's multisig

  const withdrawRes = await node.withdraw({
    publicIdentifier,
    assetId,
    channelAddress: channel.channelAddress,
    amount: reclaimable.toString(),
    recipient: participant === "alice" ? channel.alice : channel.bob,
  });
  if (!withdrawRes.isError) {
    logger.info({ method, methodId }, "Method complete");
    return withdrawRes as Result<NodeResponses.Withdraw>;
  }

  const withdrawalErr = withdrawRes.getError();
  return Result.fail(
    new CollateralError(CollateralError.reasons.UnableToReclaim, channel.channelAddress, assetId, profile, undefined, {
      withdrawError: jsonifyError(withdrawalErr!),
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
  logger.debug({ method, methodId, assetId, publicIdentifier, channel }, "Method started");
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
          profileError: jsonifyError(profileRes.getError()!),
        },
      ),
    );
  }
  const profile = profileRes.getValue();

  const target = BigNumber.from(requestedAmount ?? profile.target);

  logger.info(
    { method, methodId, target: target.toString(), channel: channel.channelAddress, assetId },
    "Collateral target calculated",
  );

  const participant = getParticipant(channel, publicIdentifier);
  if (!participant) {
    return Result.fail(
      new CollateralError(CollateralError.reasons.NotInChannel, channel.channelAddress, assetId, profile, undefined, {
        publicIdentifier,
        alice: channel.aliceIdentifier,
        bob: channel.bobIdentifier,
      }),
    );
  }

  const assetIdx = channel.assetIds.findIndex((a: string) => getAddress(a) === getAddress(assetId));
  const myBalance = BigNumber.from(getBalanceForAssetId(channel, assetId, participant));

  if (myBalance.gte(target)) {
    logger.info(
      { method, methodId, balance: myBalance.toString(), target: target.toString() },
      "Current balance is sufficient, not collateralizing",
    );
    return Result.ok(undefined);
  }
  logger.info(
    { method, methodId, target: target.toString(), myBalance: myBalance.toString() },
    "Adding collateral to channel",
  );

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
  const totalDeposited =
    participant === "alice"
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
          chainError: jsonifyError(totalDeposited.getError()!),
        },
      ),
    );
  }
  const processed =
    participant === "alice" ? channel.processedDepositsA[assetIdx] : channel.processedDepositsB[assetIdx];
  const amountToDeposit = BigNumber.from(target).sub(myBalance);
  const reconcilable = totalDeposited.getValue().sub(processed ?? "0");
  if (reconcilable.lt(amountToDeposit)) {
    // Deposit needed
    logger.info(
      {
        method,
        methodId,
        amountToDeposit: amountToDeposit.toString(),
        target: target.toString(),
        channelAddress: channel.channelAddress,
        assetId,
      },
      "Deposit calculated, submitting tx",
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
            error: jsonifyError(txRes.getError()!),
            amountToDeposit: amountToDeposit.toString(),
          },
        ),
      );
    }

    const tx = txRes.getValue();
    logger.info({ method, methodId, txHash: tx.txHash }, "Submitted deposit tx");
    const receipt = await waitForTransaction(provider, tx.txHash, 2);
    if (receipt.isError) {
      return Result.fail(
        new CollateralError(
          CollateralError.reasons.UnableToCollateralize,
          channel.channelAddress,
          assetId,
          profile,
          requestedAmount,
          {
            error: jsonifyError(receipt.getError()!),
          },
        ),
      );
    }
    logger.info({ method, methodId, txHash: tx.txHash }, "Tx mined");
    logger.debug({ method, methodId, txHash: tx.txHash, logs: receipt.getValue().logs }, "Tx mined");
  } else {
    logger.info(
      {
        method,
        methodId,
        assetId,
        channelAddress: channel.channelAddress,
        processed,
        balance: myBalance.toString(),
        totalDeposited: totalDeposited.getValue().toString(),
        amountToDeposit: amountToDeposit.toString(),
        reconcilable: reconcilable.toString(),
        target: target.toString(),
        participant,
        assetIdx,
      },
      "Owed onchain funds are sufficient",
    );
  }

  const params = {
    assetId: assetId,
    publicIdentifier,
    channelAddress: channel.channelAddress,
  };
  logger.info(
    { method, methodId, balance: myBalance.toString(), target: target.toString() },
    "Reconciling onchain funds",
  );

  // check that funds actually made it into the channel
  // hard error here if not so that the sender can know that the transfer
  // will not properly get forwarded
  // TODO: make depositRes include full channel state #395
  const depositRes = await node.reconcileDeposit(params);
  if (!depositRes.isError) {
    const postReconcile = await node.getStateChannel({ channelAddress: channel.channelAddress });
    if (postReconcile.isError) {
      return Result.fail(
        new CollateralError(
          CollateralError.reasons.UnableToCollateralize,
          channel.channelAddress,
          assetId,
          profile,
          requestedAmount,
          {
            message: "Could not getStateChannel after reconcile",
            nodeError: jsonifyError(postReconcile.getError()!),
          },
        ),
      );
    }
    const myBalance = BigNumber.from(
      getBalanceForAssetId(postReconcile.getValue() as FullChannelState, assetId, participant),
    );
    if (myBalance.lt(target)) {
      return Result.fail(
        new CollateralError(
          CollateralError.reasons.UnableToCollateralize,
          channel.channelAddress,
          assetId,
          profile,
          requestedAmount,
          {
            message: "After reconcile, balance was not present in channel",
            channel: postReconcile.getValue(),
          },
        ),
      );
    }
    logger.info({ method, methodId, myBalance: myBalance.toString() }, "Method complete");
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
        nodeError: jsonifyError(error),
      },
    ),
  );
};
