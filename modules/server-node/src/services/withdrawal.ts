import { WithdrawCommitment } from "@connext/vector-contracts";
import {
  FullChannelState,
  FullTransferState,
  jsonifyError,
  Result,
  WithdrawCommitmentJson,
} from "@connext/vector-types";
import { getRandomBytes32 } from "@connext/vector-utils";
import { HashZero } from "@ethersproject/constants";
import { parseUnits } from "@ethersproject/units";

import { logger } from "..";
import { ResubmitWithdrawalError } from "../helpers/errors";
import { getChainService, getNodes } from "../helpers/nodes";

import { PrismaStore } from "./store";

export type ResubmitWithdrawalResult = {
  transactionHash: string;
  channelAddress: string;
  transferId: string;
};

export const startWithdrawalSubmissionTask = (store: PrismaStore): void => {
  const publicIdentifiers = getNodes().map((n) => n.node.publicIdentifier);
  const interval = 30 * 60 * 1000; // every 30min
  setInterval(async () => {
    const result = await submitMainnetWithdrawalsIfNeeded(publicIdentifiers, store);
    if (result.isError) {
      logger.error({ submissionError: jsonifyError(result.getError()!) }, "Failed to submit mainnet withdrawals");
      return;
    }
  }, interval);
};

const getUnsubmittedWithdrawals = async (
  channels: FullChannelState[],
  store: PrismaStore,
): Promise<Result<{ commitment: WithdrawCommitmentJson; transfer: FullTransferState }[], ResubmitWithdrawalError>> => {
  // gather all unsubmitted withdrawal commitments for all channels
  const unsubmitted: { commitment: WithdrawCommitmentJson; transfer: FullTransferState }[] = [];
  try {
    await Promise.all(
      channels.map(async (channel) => {
        const forChannel = await store.getUnsubmittedWithdrawals(channel.channelAddress);
        if (forChannel.length === 0) {
          return;
        }
        unsubmitted.push(...forChannel);
      }),
    );
  } catch (e) {
    return Result.fail(
      new ResubmitWithdrawalError(ResubmitWithdrawalError.reasons.CouldNotGetCommitments, "", "", "", {
        error: jsonifyError(e),
      }),
    );
  }

  return Result.ok(unsubmitted);
};

const submitWithdrawalToChain = async (
  channel: FullChannelState,
  record: { commitment: WithdrawCommitmentJson; transfer: FullTransferState },
  store: PrismaStore,
): Promise<Result<ResubmitWithdrawalResult, ResubmitWithdrawalError>> => {
  // Get chain service
  const chainService = getChainService(channel.aliceIdentifier);
  if (!chainService) {
    return Result.fail(
      new ResubmitWithdrawalError(
        ResubmitWithdrawalError.reasons.ChainServiceNotFound,
        channel.aliceIdentifier,
        channel.channelAddress,
        record.transfer.transferId,
      ),
    );
  }

  // submit to chain
  const { transfer, commitment: json } = record;
  const commitment = await WithdrawCommitment.fromJson(json);
  const response = await chainService.sendWithdrawTx(channel!, commitment.getSignedTransaction());
  if (response.isError) {
    const error = response.getError()!;
    // if already submitted, store hash as HashZero
    if (!error.message.includes("CMCWithdraw: ALREADY_EXECUTED")) {
      return Result.fail(
        new ResubmitWithdrawalError(
          ResubmitWithdrawalError.reasons.SubmissionFailed,
          channel.aliceIdentifier,
          channel.channelAddress,
          record.transfer.transferId,
          { chainServiceError: jsonifyError(error) },
        ),
      );
    }
    logger.info(
      { transferId: transfer.transferId, channelAddress: channel.channelAddress, commitment: json },
      "Previously submitted",
    );
    return Result.ok({
      transactionHash: HashZero,
      channelAddress: channel.channelAddress,
      transferId: record.transfer.transferId,
    });
  }

  // submission was successful, update commitment with hash
  const transactionHash = response.getValue().hash;
  commitment.addTransaction(transactionHash);
  await store.saveWithdrawalCommitment(transfer.transferId, commitment.toJson());

  return Result.ok({ transactionHash, transferId: transfer.transferId, channelAddress: channel.channelAddress });
};

export const submitUnsubmittedWithdrawals = async (
  channels: FullChannelState[],
  store: PrismaStore,
): Promise<Result<ResubmitWithdrawalResult[], ResubmitWithdrawalError>> => {
  const method = "submitUnsubmittedWithdrawals";
  const methodId = getRandomBytes32();
  logger.debug({ method, methodId }, "Method started");

  // gather all unsubmitted withdrawal commitments for all channels
  const storeRes = await getUnsubmittedWithdrawals(channels, store);
  if (storeRes.isError) {
    return Result.fail(storeRes.getError()!);
  }
  const unsubmitted = storeRes.getValue();
  logger.info(
    { unsubmitted: unsubmitted.length, transferIds: unsubmitted.map((u) => u.transfer.transferId), method, methodId },
    "Submitting withdrawals",
  );

  // submit to chain
  const results: ResubmitWithdrawalResult[] = [];
  for (const record of unsubmitted) {
    const channel = channels.find((c) => c.channelAddress === record.commitment.channelAddress);
    if (!channel) {
      logger.error(
        { channelAddress: record.commitment.channelAddress },
        "Could not find channel, cannot submit withdrawal",
      );
      continue;
    }
    const submissionResult = await submitWithdrawalToChain(channel, record, store);
    if (submissionResult.isError) {
      logger.error(
        { method, methodId, submissionError: jsonifyError(submissionResult.getError()!) },
        "Failed to submit commitment to chain",
      );
      continue;
    }
    const { transactionHash, transferId, channelAddress } = submissionResult.getValue();
    results.push(submissionResult.getValue());
    logger.info({ method, methodId, transactionHash, transferId, channelAddress }, "Submitted withdrawal to chain");
  }
  logger.info(
    { successfulSubmissions: results.length, totalSubmissions: unsubmitted.length - results.length },
    "Submitted withdrawals",
  );
  logger.debug({ method, methodId }, "Method complete");
  return Result.ok(results);
};

export const submitMainnetWithdrawalsIfNeeded = async (
  publicIdentifiers: string[],
  store: PrismaStore,
): Promise<Result<ResubmitWithdrawalResult[], ResubmitWithdrawalError>> => {
  const method = "submitMainnetWithdrawalsIfNeeded";
  const methodId = getRandomBytes32();
  logger.debug({ method, methodId }, "Method started");
  // get all mainnet channels where node is alice
  let allChannels: FullChannelState[];
  try {
    allChannels = await store.getChannelStates();
  } catch (e) {
    return Result.fail(
      new ResubmitWithdrawalError(ResubmitWithdrawalError.reasons.CouldNotGetChannels, "", "", "", {
        error: jsonifyError(e),
      }),
    );
  }
  const channels = allChannels.filter((c) => {
    if (c.networkContext.chainId !== 1) {
      return false;
    }
    if (!publicIdentifiers.includes(c.aliceIdentifier)) {
      return false;
    }
    return true;
  });
  if (channels.length === 0) {
    logger.info({ method, methodId }, "No relevant channels found");
    logger.debug({ method, methodId }, "Method complete");
    return Result.ok([]);
  }

  // get all relevant unsubmitted withdrawals
  const unsubmitted = await getUnsubmittedWithdrawals(channels, store);
  if (unsubmitted.isError) {
    return Result.fail(unsubmitted.getError()!);
  }

  // check gas price
  const chainService = getChainService(channels[0].aliceIdentifier);
  if (!chainService) {
    return Result.fail(
      new ResubmitWithdrawalError(
        ResubmitWithdrawalError.reasons.ChainServiceNotFound,
        channels[0].aliceIdentifier,
        channels[0].channelAddress,
        "",
        { publicIdentifiers },
      ),
    );
  }
  const gasPrice = await chainService.getGasPrice(1);
  if (gasPrice.isError) {
    return Result.fail(
      new ResubmitWithdrawalError(
        ResubmitWithdrawalError.reasons.CouldNotGetGasPrice,
        channels[0].aliceIdentifier,
        "",
        "",
        { chainServiceError: jsonifyError(gasPrice.getError()!) },
      ),
    );
  }

  // submit all unsubmitted if gas price is < 150 gwei
  // otherwise, only submit old withdrawals
  const MAX_GAS_PRICE = parseUnits("150", "gwei");
  const submitAll = gasPrice.getValue().lte(MAX_GAS_PRICE);
  logger.info(
    { method, methodId, gasPrice: gasPrice.getValue().toString(), maxGasPrice: MAX_GAS_PRICE.toString() },
    "Got gas price",
  );

  // filter by old transfers, submit all that are older than 7 days
  const elapse = 7 * 24 * 60 * 60 * 1000; // 7 days
  const creationCutoff = Date.now() - elapse; // 7 days old

  const toSubmit = submitAll
    ? [...unsubmitted.getValue()]
    : unsubmitted.getValue().filter((u) => {
        const resolvedTimestamp = u.transfer.meta.resolvedAt;
        if (!resolvedTimestamp) {
          return false;
        }
        return resolvedTimestamp < creationCutoff;
      });

  const results: ResubmitWithdrawalResult[] = [];
  for (const record of toSubmit) {
    const channel = channels.find((c) => c.channelAddress === record.commitment.channelAddress)!;
    const submissionResult = await submitWithdrawalToChain(channel, record, store);
    if (submissionResult.isError) {
      logger.error(
        { method, methodId, submissionError: jsonifyError(submissionResult.getError()!) },
        "Failed to submit commitment to chain",
      );
      continue;
    }
    const { transactionHash, transferId, channelAddress } = submissionResult.getValue();
    results.push(submissionResult.getValue());
    logger.info({ method, methodId, transactionHash, transferId, channelAddress }, "Submitted withdrawal to chain");
  }
  logger.info(
    { successfulSubmissions: results.length, totalSubmissions: toSubmit.length - results.length },
    "Submitted withdrawals",
  );
  logger.debug({ method, methodId }, "Method complete");
  return Result.ok(results);
};
