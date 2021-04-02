import { VectorChainReader } from "@connext/vector-contracts";
import {
  AllowedSwap,
  HydratedProviders,
  jsonifyError,
  Result,
  TAddress,
  TBytes32,
  TIntegerString,
  MinimalTransaction,
  CheckStatusParams,
  getConfirmationsForChain,
} from "@connext/vector-types";
import { getRandomBytes32 } from "@connext/vector-utils";
import { BigNumber } from "@ethersproject/bignumber";
import { parseUnits } from "@ethersproject/units";
import { Wallet } from "@ethersproject/wallet";
import { Type, Static } from "@sinclair/typebox";
import axios from "axios";
import { BaseLogger } from "pino";
import { v4 as uuidv4 } from "uuid";

import { getConfig } from "../config";
import { AutoRebalanceServiceError } from "../errors";
import { parseBalanceToNumber, rebalancedTokens } from "../metrics";
import { hashAllowedSwap, inProgressRebalances, queueRebalance } from "./rebalanceQueue";
import { IRouterStore, RouterRebalanceRecord, RouterRebalanceStatus } from "./store";

const config = getConfig();

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
  store: IRouterStore,
): void => {
  if (interval < MIN_INTERVAL) {
    throw new Error(`Interval ${interval} must be at least ${MIN_INTERVAL}`);
  }
  setInterval(() => {
    autoRebalanceTask(logger, wallet, chainService, hydratedProviders, store);
  }, interval);
};

export const autoRebalanceTask = async (
  logger: BaseLogger,
  wallet: Wallet,
  chainService: VectorChainReader,
  hydratedProviders: HydratedProviders,
  store: IRouterStore,
): Promise<void> => {
  const method = "autoRebalanceTask";
  const methodId = getRandomBytes32();
  logger.info({ method, methodId, allowedSwaps: config.allowedSwaps }, "Start task");
  for (const swap of config.allowedSwaps) {
    const rebalanced = await rebalanceIfNeeded(swap, logger, wallet, chainService, hydratedProviders, store);
    if (rebalanced.isError) {
      logger.error({ swap, error: jsonifyError(rebalanced.getError()!) }, "Error auto rebalancing");
      return;
    }
    logger.info({ res: rebalanced.getValue() }, "Rebalance completed");
  }
};

export const rebalanceIfNeeded = async (
  swap: AllowedSwap,
  logger: BaseLogger,
  wallet: Wallet,
  chainService: VectorChainReader,
  hydratedProviders: HydratedProviders,
  store: IRouterStore,
): Promise<Result<undefined, AutoRebalanceServiceError>> => {
  // const resourcesInUse = inProgressRebalances[hashAllowedSwap(swap)];
  // if (resourcesInUse) {
  //   // @TODO: Should we return AutoRebalanceServiceError here?
  //   // Pro: lets user know this is being called 'too many' times.
  //   // Con: it may happen regardless due to this just being a race condition, and we're
  //   // circumventing here with this logic anyway.
  //   return Result.ok(undefined);
  // } else {
  return await queueRebalance<Result<undefined, AutoRebalanceServiceError>>(hashAllowedSwap(swap), () => {
    return _rebalanceIfNeeded(
      swap,
      logger,
      wallet,
      chainService,
      hydratedProviders,
      store,
    )
  });
}

const _rebalanceIfNeeded = async (
  swap: AllowedSwap,
  logger: BaseLogger,
  wallet: Wallet,
  chainService: VectorChainReader,
  hydratedProviders: HydratedProviders,
  store: IRouterStore,
): Promise<Result<undefined, AutoRebalanceServiceError>> => {
  const method = "rebalanceIfNeeded";
  const methodId = getRandomBytes32();
  if (!swap.rebalancerUrl) {
    logger.debug({ method, intervalId: methodId, swap }, "No rebalancer configured for swap, doing nothing");
    return Result.ok(undefined);
  }
  logger.info({ method, intervalId: methodId, swap }, "Checking if rebalance is needed");
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

  if (fromAssetBalanceNumber <= threshold) {
    logger.info(
      {
        method,
        intervalId: methodId,
        swap,
      },
      "No rebalance required",
    );
    return Result.ok(undefined);
  }

  const amountToSendNumber = fromAssetBalanceNumber - midpoint;
  const amountToSend = parseUnits(
    amountToSendNumber.toString(),
    rebalancedTokens[swap.fromChainId][swap.fromAssetId].decimals!,
  );
  logger.info(
    {
      method,
      intervalId: methodId,
      amountToSendNumber,
      amountToSend: amountToSend.toString(),
    },
    "Rebalance required",
  );

  // on each rebalance interval, check rebalance thresholds for allowedSwaps
  // if out of threshold, check if active rebalance for that swap exists
  // if it does not, create one and go through the approve/execute flow
  // if it does exist, check status. if status == {completed: true} and/or
  // if there is a tx in the response (is the case with matic withdraw),
  // send the tx, and mark as completed. if no tx in the response, mark as completed immediately
  // if it is not finished, wait for next poll

  // check if an active rebalance is in progress
  let latestRebalance = await store.getLatestRebalance(swap);

  if (!latestRebalance || latestRebalance.status === RouterRebalanceStatus.COMPLETE) {
    // If there's no record of a previous rebalance, or if the last one finished successfully,
    // create a new rebalance record.
    latestRebalance = {
      swap,
      status: RouterRebalanceStatus.PENDING,
      id: uuidv4()
    } as RouterRebalanceRecord;
    await store.saveRebalance(latestRebalance);
  }

  if (latestRebalance.status === RouterRebalanceStatus.PENDING) {
    // approve rebalance
    const approveResult = await approveRebalance(
      amountToSend,
      swap,
      hydratedProviders,
      wallet,
      logger,
      methodId,
      async (txHash: string) => {
        // save hash
        latestRebalance = {
          ...latestRebalance,
          approveHash: txHash,
        } as RouterRebalanceRecord;
        await store.saveRebalance(latestRebalance);
      }
    );
    if (approveResult.isError) {
      return Result.fail(approveResult.getError()!);
    }

    // Save approved status. Once method above returns, receipt has been received.
    latestRebalance = {
      ...latestRebalance,
      status: RouterRebalanceStatus.APPROVED,
    };
    await store.saveRebalance(latestRebalance);
  }

  if (latestRebalance.status === RouterRebalanceStatus.APPROVED) {
    const executeResult = await executeRebalance(
      amountToSend,
      swap,
      hydratedProviders,
      wallet,
      logger,
      methodId,
      async (txHash: string) => {
        // save hash
        latestRebalance = {
          ...latestRebalance,
          executeHash: txHash,
        } as RouterRebalanceRecord;
        await store.saveRebalance(latestRebalance);
      }
    );
    if (executeResult.isError) {
      return Result.fail(executeResult.getError()!);
    }
    // Save executed status. Once method above returns, receipt has been received.
    latestRebalance = {
      ...latestRebalance,
      status: RouterRebalanceStatus.EXECUTED
    };
    await store.saveRebalance(latestRebalance);
  }

  if (latestRebalance.status === RouterRebalanceStatus.EXECUTED) {
    if (!latestRebalance.executeHash) {
      return Result.fail(
        new AutoRebalanceServiceError(
          AutoRebalanceServiceError.reasons.ExecutedWithoutHash,
          swap.fromChainId,
          swap.fromAssetId,
          { method, methodId, latestRebalance },
        ),
      );
    }

    const completedResult = await completeRebalance(
      amountToSend,
      latestRebalance.executeHash,
      swap,
      hydratedProviders,
      wallet,
      logger,
      methodId,
      async (txHash: string) => {
        // save hash
        latestRebalance = {
          ...latestRebalance,
          completeHash: txHash,
        } as RouterRebalanceRecord;
        await store.saveRebalance(latestRebalance);
      }
    );
    if (completedResult.isError) {
      return Result.fail(completedResult.getError()!);
    }
    if (!completedResult.getValue().complete) {
      // Completion tx failed to receive confirmation receipt, so we'll close this out
      // and retry on another call of this method.
      return Result.ok(undefined);
    }
    // Save complete status. Once method above returns, receipt has been received.
    latestRebalance = {
      ...latestRebalance,
      status: RouterRebalanceStatus.COMPLETE
    };
    await store.saveRebalance(latestRebalance);
  }

  return Result.ok(undefined);
};

// TODO: add rebalance txs to metrics/db
export const approveRebalance = async (
  amount: BigNumber,
  swap: AllowedSwap,
  hydratedProviders: HydratedProviders,
  wallet: Wallet,
  logger: BaseLogger,
  methodId: string = getRandomBytes32(),
  onSendTx: (txHash: string) => Promise<void>,
): Promise<Result<string | undefined, AutoRebalanceServiceError>> => {
  const method = "approveRebalance";
  logger.debug({ method, methodId, swap, amount: amount.toString() }, "Method started");

  try {
    const approveUrl = `${swap.rebalancerUrl}/approval`;
    const postBody: RebalanceParams = {
      amount: amount.toString(),
      assetId: swap.fromAssetId,
      fromProvider: config.chainProviders[swap.fromChainId],
      fromChainId: swap.fromChainId,
      toProvider: config.chainProviders[swap.toChainId],
      toChainId: swap.toChainId,
      signer: wallet.address,
    };
    logger.info(
      {
        method,
        methodId,
        approveUrl,
        postBody,
      },
      "Sending approval request",
    );
    const approveRes = await axios.post(approveUrl, postBody);
    logger.info(
      {
        method,
        methodId,
        approveRes: approveRes.data,
        status: approveRes.data.status,
      },
      "Approval request complete",
    );
    if (!approveRes.data.transaction) {
      logger.info(
        {
          method,
          methodId,
          allowance: approveRes.data.allowance,
          status: approveRes.data.status,
        },
        "Approval not needed",
      );
      return Result.ok(undefined);
    }
    logger.info(
      {
        method,
        methodId,
        transaction: approveRes.data.transaction,
      },
      "Approval required",
    );
    const transactionHash = await sendTransaction(
      swap.fromChainId,
      approveRes.data.transaction,
      wallet,
      hydratedProviders,
      logger,
      method,
      methodId,
      onSendTx,
    );
    return Result.ok(transactionHash);
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
};

// TODO: add rebalance txs to metrics/db
export const executeRebalance = async (
  amount: BigNumber,
  swap: AllowedSwap,
  hydratedProviders: HydratedProviders,
  wallet: Wallet,
  logger: BaseLogger,
  methodId: string = getRandomBytes32(),
  onSendTx: (txHash: string) => Promise<void>,
): Promise<Result<string, AutoRebalanceServiceError>> => {
  // execute rebalance
  const method = "executeRebalance";
  logger.debug({ method, methodId, swap, amount: amount.toString() }, "Method started");
  try {
    const rebalanceUrl = `${swap.rebalancerUrl}/execute`;
    const postBody: RebalanceParams = {
      amount: amount.toString(),
      assetId: swap.fromAssetId,
      fromProvider: config.chainProviders[swap.fromChainId],
      fromChainId: swap.fromChainId,
      toProvider: config.chainProviders[swap.toChainId],
      toChainId: swap.toChainId,
      signer: wallet.address,
    };
    logger.info(
      {
        method,
        methodId,
        rebalanceUrl,
        postBody,
      },
      "Sending rebalance execute request",
    );
    const rebalanceRes = await axios.post(rebalanceUrl, postBody);
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

    const transactionHash = await sendTransaction(
      swap.fromChainId,
      rebalanceRes.data.transaction,
      wallet,
      hydratedProviders,
      logger,
      method,
      methodId,
      onSendTx,
    );
    return Result.ok(transactionHash);
  } catch (e) {
    return Result.fail(
      new AutoRebalanceServiceError(
        AutoRebalanceServiceError.reasons.CouldNotExecuteRebalance,
        swap.fromChainId,
        swap.fromAssetId,
        { methodId, method, error: jsonifyError(e) },
      ),
    );
  }
};

// TODO: add rebalance txs to metrics/db
// NOTE: only l2 --> l1 withdrawals have a completion tx
export const completeRebalance = async (
  amount: BigNumber,
  executedHash: string,
  swap: AllowedSwap,
  hydratedProviders: HydratedProviders,
  wallet: Wallet,
  logger: BaseLogger,
  methodId: string = getRandomBytes32(),
  onSendTx: (txHash: string) => Promise<void>,
): Promise<Result<{ transactionHash?: string; complete: boolean }, AutoRebalanceServiceError>> => {
  // complete/check rebalance status
  const method = "completeRebalance";
  logger.debug({ method, methodId, swap, amount: amount.toString() }, "Method started");
  try {
    const statusUrl = `${swap.rebalancerUrl}/status`;
    const postBody: CheckStatusParams = {
      txHash: executedHash,
      fromProvider: config.chainProviders[swap.fromChainId],
      fromChainId: swap.fromChainId,
      toProvider: config.chainProviders[swap.toChainId],
      toChainId: swap.toChainId,
      signer: wallet.address,
    };
    logger.info(
      {
        method,
        methodId,
        statusUrl,
        postBody,
      },
      "Sending rebalance status request",
    );
    // check status
    const statusRes = await axios.post(statusUrl, postBody);
    logger.info(
      {
        method,
        intervalId: methodId,
        statusRes: statusRes.data,
      },
      "Status request sent",
    );
    const { status } = statusRes.data;
    if (!status || !status.completed) {
      logger.info({ status, method, intervalId: methodId }, "Rebalance not completed");
      return Result.ok({ complete: false });
    }
    // is completed, check if tx is needed
    if (!status.transaction) {
      logger.info({ intervalId: methodId }, "No completion tx required");
      return Result.ok({ complete: true });
    }
    logger.info({ status, method, intervalId: methodId }, "Sending complete tx");
    // need to send tx to complete rebalance
    const transactionHash = await sendTransaction(
      status.transaction.chainId,
      status.transaction,
      wallet,
      hydratedProviders,
      logger,
      method,
      methodId,
      onSendTx,
    );
    logger.info(
      { transactionHash, transaction: status.transaction, method, intervalId: methodId },
      "Sent execute tx, completed",
    );
    return Result.ok({ transactionHash, complete: true });
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
};

const sendTransaction = async (
  chainId: number,
  transaction: MinimalTransaction,
  wallet: Wallet,
  providers: HydratedProviders,
  logger: BaseLogger,
  method: string = "sendTransaction",
  methodId: string = getRandomBytes32(),
  onSendTx: (txHash: string) => Promise<void>,
): Promise<string> => {
  const provider = providers[chainId];
  if (!provider) {
    throw new Error(`No provider for chain ${chainId}, cannot send tx`);
  }
  const gasPrice = (transaction as any).gasPrice ?? (await provider.getGasPrice());
  logger.info(
    {
      method,
      intervalId: methodId,
      chainId,
      gasPrice: gasPrice.toString(),
      from: wallet.address,
      data: transaction.data,
      to: transaction.to,
      value: (transaction.value ?? 0).toString(),
    },
    "Sending tx",
  );
  const response = await wallet.connect(provider).sendTransaction({
    to: transaction.to,
    value: transaction.value ?? 0,
    data: transaction.data,
    gasPrice: BigNumber.from(gasPrice),
  });
  logger.info(
    {
      method,
      intervalId: methodId,
      hash: response.hash,
    },
    "Tx sent",
  );

  // We need to await this callback before proceeding (as it's used to store state, and
  // we want to avoid a race condition).
  await onSendTx(response.hash);

  // Get confirmation receipt, then return.
  const receipt = await response.wait(getConfirmationsForChain(chainId));
  logger.info(
    {
      method,
      intervalId: methodId,
      hash: receipt.transactionHash,
    },
    "Tx mined",
  );
  return receipt.transactionHash;
};
