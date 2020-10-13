import {
  FullChannelState,
  INodeService,
  Result,
  ServerNodeResponses,
  Values,
  VectorError,
} from "@connext/vector-types";
import { BigNumber, constants } from "ethers";
import { BaseLogger } from "pino";

import { ChainJsonProviders } from "./listener";
import { getRebalanceProfile } from "./services/rebalance";

export class RequestCollateralError extends VectorError {
  readonly type = VectorError.errors.RouterError;

  static readonly reasons = {
    ChannelNotFound: "Channel not found",
    ProviderNotFound: "Provider not found",
    UnableToGetRebalanceProfile: "Could not get rebalance profile",
    TargetHigherThanThreshold: "Specified target is higher than reclaim threshold",
    TxError: "Error sending deposit transaction",
    UnableToCollateralize: "Could not collateralize channel",
  } as const;

  constructor(
    public readonly message: Values<typeof RequestCollateralError.reasons>,
    // eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
    public readonly context?: any,
  ) {
    super(message, context);
  }
}

export const requestCollateral = async (
  channel: FullChannelState,
  assetId: string,
  publicIdentifier: string,
  node: INodeService,
  chainProviders: ChainJsonProviders,
  logger: BaseLogger,
  requestedAmount?: string,
  transferAmount?: string, // used when called internally
): Promise<Result<undefined | ServerNodeResponses.Deposit, RequestCollateralError>> => {
  const profileRes = await getRebalanceProfile(channel.networkContext.chainId, assetId);
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

  const iAmAlice = publicIdentifier === channel.aliceIdentifier;

  const assetIdx = channel.assetIds.findIndex(assetId => assetId === assetId);
  const myBalance =
    assetIdx === -1 ? constants.Zero : BigNumber.from(channel.balances[assetIdx].amount[iAmAlice ? 0 : 1]);

  if (myBalance.gte(target)) {
    logger.info({ balance: channel.balances[assetIdx], target }, "Current balance is sufficient, not collateralizing");
    return Result.ok(undefined);
  }

  const provider = chainProviders[channel.networkContext.chainId];
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

  const amountToDeposit = BigNumber.from(target).sub(myBalance);
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

  const depositRes = await node.reconcileDeposit({
    assetId: assetId,
    publicIdentifier,
    channelAddress: channel.channelAddress,
  });
  if (depositRes.isError) {
    return Result.fail(
      new RequestCollateralError(RequestCollateralError.reasons.UnableToCollateralize, {
        channelAddress: channel.channelAddress,
        error: depositRes.getError()?.message,
        context: depositRes.getError()?.context,
      }),
    );
  }

  return depositRes as Result<ServerNodeResponses.Deposit>;
};
