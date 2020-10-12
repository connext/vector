import {
  FullChannelState,
  INodeService,
  RequestCollateralPayload,
  Result,
  ServerNodeResponses,
  Values,
  VectorError,
} from "@connext/vector-types";
import { BigNumber, constants, providers } from "ethers";
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
  data: RequestCollateralPayload,
  publicIdentifier: string,
  node: INodeService,
  chainProviders: ChainJsonProviders,
  logger: BaseLogger,
): Promise<Result<undefined | ServerNodeResponses.Deposit, RequestCollateralError>> => {
  const channelRes = await node.getStateChannel({ channelAddress: data.channelAddress, publicIdentifier });
  if (channelRes.isError) {
    return Result.fail(
      new RequestCollateralError(RequestCollateralError.reasons.ChannelNotFound, {
        channelAddress: data.channelAddress,
        error: channelRes.getError()?.message,
        context: channelRes.getError()?.context,
      }),
    );
  }
  const channel: FullChannelState = channelRes.getValue();
  if (!channel) {
    return Result.fail(
      new RequestCollateralError(RequestCollateralError.reasons.ChannelNotFound, {
        channelAddress: data.channelAddress,
      }),
    );
  }

  const profileRes = await getRebalanceProfile(channel.networkContext.chainId, data.assetId);
  if (profileRes.isError) {
    return Result.fail(
      new RequestCollateralError(RequestCollateralError.reasons.UnableToGetRebalanceProfile, {
        channelAddress: data.channelAddress,
        error: profileRes.getError()?.message,
        context: profileRes.getError()?.context,
      }),
    );
  }
  const profile = profileRes.getValue();
  if (data.amount && BigNumber.from(data.amount).gt(profile.reclaimThreshold)) {
    return Result.fail(
      new RequestCollateralError(RequestCollateralError.reasons.TargetHigherThanThreshold, {
        channelAddress: data.channelAddress,
        profile,
        data,
      }),
    );
  }
  const target = data.amount || profile.target;
  const iAmAlice = publicIdentifier === channel.aliceIdentifier;

  const assetIdx = channel.assetIds.findIndex(assetId => assetId === data.assetId);
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
        channelAddress: data.channelAddress,
        chainId: channel.networkContext.chainId,
        data,
      }),
    );
  }

  const amountToDeposit = BigNumber.from(target).sub(myBalance);
  const txRes = await node.sendDepositTx({
    amount: amountToDeposit.toString(),
    assetId: data.assetId,
    chainId: channel.networkContext.chainId,
    channelAddress: data.channelAddress,
    publicIdentifier,
  });
  if (txRes.isError) {
    return Result.fail(
      new RequestCollateralError(RequestCollateralError.reasons.TxError, {
        channelAddress: data.channelAddress,
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
    assetId: data.assetId,
    publicIdentifier,
    channelAddress: data.channelAddress,
  });
  if (depositRes.isError) {
    return Result.fail(
      new RequestCollateralError(RequestCollateralError.reasons.UnableToCollateralize, {
        channelAddress: data.channelAddress,
        error: depositRes.getError()?.message,
        context: depositRes.getError()?.context,
      }),
    );
  }

  return depositRes as Result<ServerNodeResponses.Deposit>;
};
