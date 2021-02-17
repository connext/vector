import { VectorChainReader } from "@connext/vector-contracts";
import {
  AllowedSwap,
  HydratedProviders,
  jsonifyError,
  Result,
  TAddress,
  TBytes32,
  TIntegerString,
} from "@connext/vector-types";
import { getRandomBytes32 } from "@connext/vector-utils";
import { AddressZero } from "@ethersproject/constants";
import { parseUnits } from "@ethersproject/units";
import { Wallet } from "@ethersproject/wallet";
import { Type, Static } from "@sinclair/typebox";
import axios from "axios";
import { BaseLogger } from "pino";

import { config } from "./config";
import { AutoRebalanceServiceError } from "./errors";
import { parseBalanceToNumber, rebalancedTokens } from "./metrics";

const DEFAULT_REBALANCE_THRESHOLD = 20;
const MIN_INTERVAL = 1_800_000;

// copied from chain-rebalancer-fastify
export const RebalanceParamsSchema = Type.Object({
  amount: TIntegerString,
  assetId: TAddress,
  signer: TAddress,
  txHash: Type.Optional(TBytes32),
  fromProvider: Type.String({ format: "uri" }),
  toProvider: Type.String({ format: "uri" }),
  fromChainId: Type.Number(),
  toChainId: Type.Number(),
});
export type RebalanceParams = Static<typeof RebalanceParamsSchema>;

export const startAutoRebalanceTask = (
  interval: number,
  logger: BaseLogger,
  wallet: Wallet,
  chainService: VectorChainReader,
  hydratedProviders: HydratedProviders,
): void => {
  if (interval < MIN_INTERVAL) {
    throw new Error(`Interval ${interval} must be at least ${MIN_INTERVAL}`);
  }
  setInterval(() => {
    autoRebalanceTask(logger, wallet, chainService, hydratedProviders);
  }, interval);
};

export const autoRebalanceTask = async (
  logger: BaseLogger,
  wallet: Wallet,
  chainService: VectorChainReader,
  hydratedProviders: HydratedProviders,
): Promise<void> => {
  const method = "rebalanceIfNeeded";
  const methodId = getRandomBytes32();
  logger.info({ method, methodId, allowedSwaps: config.allowedSwaps }, "Start task");
  config.allowedSwaps.map(async (swap) => {
    const rebalanced = await rebalanceIfNeeded(swap, logger, wallet, chainService, hydratedProviders);
    if (rebalanced.isError) {
      logger.error({ swap, error: jsonifyError(rebalanced.getError()!) }, "Error auto rebalancing");
    }
  });
};

export const rebalanceIfNeeded = async (
  swap: AllowedSwap,
  logger: BaseLogger,
  wallet: Wallet,
  chainService: VectorChainReader,
  hydratedProviders: HydratedProviders,
): Promise<Result<{ txHash?: string }, AutoRebalanceServiceError>> => {
  const method = "rebalanceIfNeeded";
  const methodId = getRandomBytes32();
  if (!swap.rebalancerUrl) {
    logger.debug({ method, intervalId: methodId, swap }, "No rebalancer configured for swap, doing nothing");
    return Result.ok({});
  }
  logger.info({ method, intervalId: methodId, swap }, "Checking if rebalance is needed");
  const fromProvider = hydratedProviders[swap.fromChainId];
  const rebalanceThreshold = swap.rebalanceThresholdPct ? swap.rebalanceThresholdPct : DEFAULT_REBALANCE_THRESHOLD;

  const fromAssetBalance = await chainService.getOnchainBalance(swap.fromAssetId, wallet.address, swap.fromChainId);
  if (fromAssetBalance.isError) {
    return Result.fail(
      new AutoRebalanceServiceError(
        AutoRebalanceServiceError.reasons.CouldNotGetAssetBalance,
        swap.fromChainId,
        swap.fromAssetId,
        { getOnchainBalanceError: jsonifyError(fromAssetBalance.getError()!), methodId, method },
      ),
    );
  }
  const fromAssetBalanceNumber = await parseBalanceToNumber(
    fromAssetBalance.getValue(),
    swap.fromChainId.toString(),
    swap.fromAssetId,
  );

  const toAssetBalance = await chainService.getOnchainBalance(swap.toAssetId, wallet.address, swap.toChainId);
  if (toAssetBalance.isError) {
    return Result.fail(
      new AutoRebalanceServiceError(
        AutoRebalanceServiceError.reasons.CouldNotGetAssetBalance,
        swap.toChainId,
        swap.toAssetId,
        { getOnchainBalanceError: jsonifyError(toAssetBalance.getError()!), methodId, method },
      ),
    );
  }
  const toAssetBalanceNumber = await parseBalanceToNumber(
    toAssetBalance.getValue(),
    swap.toChainId.toString(),
    swap.toAssetId,
  );

  // should be within 1/2 of total balance + threshold
  const totalBalance = fromAssetBalanceNumber + toAssetBalanceNumber;
  const midpoint = totalBalance / 2;
  const threshold = midpoint * (1 + rebalanceThreshold / 100);

  logger.info(
    {
      method,
      intervalId: methodId,
      fromAssetBalanceNumber,
      toAssetBalanceNumber,
      rebalanceThreshold,
      totalBalance,
      threshold,
      midpoint,
    },
    "Calculated numbers",
  );

  if (fromAssetBalanceNumber > threshold) {
    const amountToSendNumber = fromAssetBalanceNumber - midpoint;
    const amountToSend = parseUnits(
      amountToSendNumber.toString(),
      rebalancedTokens[swap.fromChainId][swap.fromAssetId].decimals!,
    );
    // rebalance required
    logger.info(
      {
        method,
        intervalId: methodId,
        amountToSendNumber,
        amountToSend,
      },
      "Rebalance required",
    );

    // approve ERC20
    if (swap.fromAssetId !== AddressZero) {
      try {
        logger.info(
          {
            method,
            intervalId: methodId,
            amount: amountToSend.toString(),
            assetId: swap.fromAssetId,
            fromProvider: config.chainProviders[swap.fromChainId],
            fromChainId: swap.fromChainId,
            toProvider: config.chainProviders[swap.toChainId],
            toChainId: swap.toChainId,
            signer: wallet.address,
            url: `${swap.rebalancerUrl}/approval`,
          },
          "Approval required, sending request",
        );
        const approveRes = await axios.post(`${swap.rebalancerUrl}/approval`, {
          amount: amountToSend.toString(),
          assetId: swap.fromAssetId,
          fromProvider: config.chainProviders[swap.fromChainId],
          fromChainId: swap.fromChainId,
          toProvider: config.chainProviders[swap.toChainId],
          toChainId: swap.toChainId,
          signer: wallet.address,
        } as RebalanceParams);
        logger.info(
          {
            method,
            intervalId: methodId,
            approveRes: approveRes.data,
            status: approveRes.status,
          },
          "Approval request complete",
        );
        if (approveRes.data.transaction) {
          const transaction = approveRes.data.transaction;
          logger.info(
            {
              transaction,
              method,
              intervalId: methodId,
            },
            "Sending approval tx",
          );
          const response = await wallet
            .connect(fromProvider)
            .sendTransaction({ to: transaction.to, value: 0, data: transaction.data });
          logger.info(
            {
              method,
              intervalId: methodId,
              hash: response.hash,
            },
            "Approval tx sent, waiting for confirmation",
          );

          const receipt = await response.wait();
          logger.info(
            {
              method,
              intervalId: methodId,
              hash: receipt.transactionHash,
              index: receipt.transactionIndex,
            },
            "Approval tx confirmed",
          );
        } else {
          logger.info(
            {
              method,
              intervalId: methodId,
              approveRes: approveRes.data,
              status: approveRes.status,
            },
            "Approval not needed",
          );
        }
      } catch (e) {
        return Result.fail(
          new AutoRebalanceServiceError(
            AutoRebalanceServiceError.reasons.CouldNotCompleteApproval,
            swap.fromChainId,
            swap.fromAssetId,
            { methodId, method, error: jsonifyError(e) },
          ),
        );
      }
    }

    // execute rebalance
    try {
      logger.info(
        {
          method,
          intervalId: methodId,
          amount: amountToSend.toString(),
          assetId: swap.fromAssetId,
          fromProvider: config.chainProviders[swap.fromChainId],
          fromChainId: swap.fromChainId,
          toProvider: config.chainProviders[swap.toChainId],
          toChainId: swap.toChainId,
          signer: wallet.address,
          url: `${swap.rebalancerUrl}/approval`,
        },
        "Sending rebalance request",
      );
      const rebalanceRes = await axios.post(`${swap.rebalancerUrl}/execute`, {
        amount: amountToSend.toString(),
        assetId: swap.fromAssetId,
        fromProvider: config.chainProviders[swap.fromChainId],
        fromChainId: swap.fromChainId,
        toProvider: config.chainProviders[swap.toChainId],
        toChainId: swap.toChainId,
        signer: wallet.address,
      } as RebalanceParams);
      logger.info(
        {
          method,
          intervalId: methodId,
          rebalanceRes: rebalanceRes.data,
          status: rebalanceRes.status,
        },
        "Rebalance request sent",
      );
      if (!rebalanceRes.data.transaction) {
        return Result.fail(
          new AutoRebalanceServiceError(
            AutoRebalanceServiceError.reasons.CouldNotCompleteRebalance,
            swap.fromChainId,
            swap.fromAssetId,
            { methodId, method, error: "No transaction data available", data: rebalanceRes.data },
          ),
        );
      }

      const transaction = rebalanceRes.data.transaction;
      logger.info(
        {
          method,
          intervalId: methodId,
        },
        "Sending rebalance tx",
      );
      const response = await wallet
        .connect(fromProvider)
        .sendTransaction({ to: transaction.to, value: 0, data: transaction.data });
      logger.info(
        {
          method,
          intervalId: methodId,
          hash: response.hash,
        },
        "Rebalance tx sent",
      );
      return Result.ok({ txHash: response.hash });
    } catch (e) {
      return Result.fail(
        new AutoRebalanceServiceError(
          AutoRebalanceServiceError.reasons.CouldNotCompleteRebalance,
          swap.fromChainId,
          swap.fromAssetId,
          { methodId, method, error: jsonifyError(e) },
        ),
      );
    }
  }
  return Result.ok({});
};
