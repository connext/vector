import { WithdrawCommitment } from "@connext/vector-contracts";
import {
  FullChannelState,
  FullTransferState,
  IVectorChainService,
  jsonifyError,
  WithdrawCommitmentJson,
} from "@connext/vector-types";
import { HashZero } from "@ethersproject/constants";

import { logger } from "..";
import { PrismaStore } from "../services/store";

const getUnsubmittedWithdrawals = async (channels: FullChannelState[], store: PrismaStore) => {
  // gather all unsubmitted withdrawal commitments for all channels
  const unsubmitted: { commitment: WithdrawCommitmentJson; transfer: FullTransferState }[] = [];
  await Promise.all(
    channels.map(async (channel) => {
      const forChannel = await store.getUnsubmittedWithdrawals(channel.channelAddress);
      if (forChannel.length === 0) {
        return;
      }
      unsubmitted.push(...forChannel);
    }),
  );
  return unsubmitted;
};

export const submitUnsubmittedWithdrawals = async (
  channels: FullChannelState[],
  chainService: IVectorChainService,
  store: PrismaStore,
): Promise<{ transactionHash: string; transferId: string }[]> => {
  // gather all unsubmitted withdrawal commitments for all channels
  const unsubmitted = await getUnsubmittedWithdrawals(channels, store);
  logger.info(
    { unsubmitted: unsubmitted.length, transferIds: unsubmitted.map((u) => u.transfer.transferId) },
    "Submitting withdrawals",
  );

  // submit to chain
  const transactions = [];
  for (const record of unsubmitted) {
    const { transfer, commitment: json } = record;
    const commitment = await WithdrawCommitment.fromJson(json);
    const channel = channels.find((c) => c.channelAddress === commitment.channelAddress);
    const response = await chainService.sendWithdrawTx(channel!, commitment.getSignedTransaction());
    let transactionHash = HashZero;
    if (response.isError) {
      // TODO: if error is CMC ALREADY_SUBMITTED, store HashZero
      const error = response.getError()!;
      if (!error.message.includes("CMCWithdraw: ALREADY_EXECUTED")) {
        logger.error(
          {
            channelAddress: channel?.channelAddress,
            commitment: json,
            transferId: transfer.transferId,
            error: jsonifyError(error),
          },
          "Failed to submit withdrawal",
        );
        continue;
      }
      logger.info(
        { transferId: transfer.transferId, channelAddress: channel?.channelAddress, commitment: json },
        "Previously submitted",
      );
    } else {
      transactionHash = response.getValue().hash;
    }

    transactions.push({ transactionHash, transferId: transfer.transferId });
    commitment.addTransaction(transactionHash);
    await store.saveWithdrawalCommitment(transfer.transferId, commitment.toJson());
  }
  logger.info(
    { submitted: transactions.length, transferIds: transactions.map((u) => u.transferId) },
    "Submitted withdrawals",
  );
  return transactions;
};

export const submitMainnetWithdrawalsIfNeeded = async (
  publicIdentifiers: string[],
  store: PrismaStore,
): Promise<void> => {
  const channels = (await store.getChannelStates()).filter((c) => c.networkContext.chainId === 1);
  const unsubmitted = await getUnsubmittedWithdrawals(channels, store);

  // get all the withdrawals to submit

  // filter by old transfers, submit all that are older than 7 days
  const elapse = 7 * 24 * 60 * 60 * 1000; // 7 days
  const creationCutoff = new Date(); // 7 days old

  // if gas price low, submit the rest
};
