import {
  ConditionalTransferCreatedPayload,
  ConditionalTransferResolvedPayload,
  DepositReconciledPayload,
  WithdrawalCreatedPayload,
  WithdrawalResolvedPayload,
  WithdrawalReconciledPayload,
  SetupPayload,
  RequestCollateralPayload,
  RestoreStatePayload,
  IsAlivePayload,
  EngineEvents,
  ChainServiceEvents,
  TransactionSubmittedPayload,
  TransactionMinedPayload,
  TransactionFailedPayload,
  IVectorChainReader,
  Result,
  ChannelDisputedPayload,
  ChannelDefundedPayload,
  TransferDisputedPayload,
  TransferDefundedPayload,
  ConditionalTransferRoutingCompletePayload,
  ChainAddresses,
  ChannelRpcMethodsResponsesMap,
  ChannelRpcMethods,
  EngineError,
  FullChannelState,
  IEngineStore,
  IVectorChainService,
  TransferNames,
  jsonifyError,
  IMessagingService,
} from "@connext/vector-types";
import { WithdrawCommitment } from "@connext/vector-contracts";
import { FeeCalculationError, normalizeFee, getRandomBytes32, getParticipant } from "@connext/vector-utils";
import { BigNumber } from "@ethersproject/bignumber";
import { Evt } from "evt";
import { AddressZero, HashZero } from "@ethersproject/constants";
import { BaseLogger } from "pino";

import { EngineEvtContainer } from "./index";
import { RpcError } from "./errors";

export const getEngineEvtContainer = (): EngineEvtContainer => {
  return {
    [EngineEvents.IS_ALIVE]: Evt.create<IsAlivePayload>(),
    [EngineEvents.SETUP]: Evt.create<SetupPayload>(),
    [EngineEvents.CONDITIONAL_TRANSFER_CREATED]: Evt.create<ConditionalTransferCreatedPayload>(),
    [EngineEvents.CONDITIONAL_TRANSFER_RESOLVED]: Evt.create<ConditionalTransferResolvedPayload>(),
    [EngineEvents.CONDITIONAL_TRANSFER_ROUTING_COMPLETE]: Evt.create<ConditionalTransferRoutingCompletePayload>(),
    [EngineEvents.DEPOSIT_RECONCILED]: Evt.create<DepositReconciledPayload>(),
    [EngineEvents.REQUEST_COLLATERAL]: Evt.create<RequestCollateralPayload>(),
    [EngineEvents.RESTORE_STATE_EVENT]: Evt.create<RestoreStatePayload>(),
    [EngineEvents.WITHDRAWAL_CREATED]: Evt.create<WithdrawalCreatedPayload>(),
    [EngineEvents.WITHDRAWAL_RESOLVED]: Evt.create<WithdrawalResolvedPayload>(),
    [EngineEvents.WITHDRAWAL_RECONCILED]: Evt.create<WithdrawalReconciledPayload>(),
    [ChainServiceEvents.TRANSACTION_SUBMITTED]: Evt.create<
      TransactionSubmittedPayload & { publicIdentifier: string }
    >(),
    [ChainServiceEvents.TRANSACTION_MINED]: Evt.create<TransactionMinedPayload & { publicIdentifier: string }>(),
    [ChainServiceEvents.TRANSACTION_FAILED]: Evt.create<TransactionFailedPayload & { publicIdentifier: string }>(),
    [ChainServiceEvents.CHANNEL_DISPUTED]: Evt.create<ChannelDisputedPayload & { publicIdentifier: string }>(),
    [ChainServiceEvents.CHANNEL_DEFUNDED]: Evt.create<ChannelDefundedPayload & { publicIdentifier: string }>(),
    [ChainServiceEvents.TRANSFER_DISPUTED]: Evt.create<TransferDisputedPayload & { publicIdentifier: string }>(),
    [ChainServiceEvents.TRANSFER_DEFUNDED]: Evt.create<TransferDefundedPayload & { publicIdentifier: string }>(),
  };
};

// Yes, this is dumb. It helps with mocking because using
// sinon to mock vector-utils functions does not work
export function normalizeGasFees(
  fee: BigNumber,
  baseAssetDecimals: number,
  desiredFeeAssetId: string, // asset you want fee denominated in
  desiredFeeAssetDecimals: number,
  chainId: number,
  ethReader: IVectorChainReader,
  logger: BaseLogger,
  gasPriceOverride?: BigNumber,
): Promise<Result<BigNumber, FeeCalculationError>> {
  return normalizeFee(
    fee,
    baseAssetDecimals,
    desiredFeeAssetId,
    desiredFeeAssetDecimals,
    chainId,
    ethReader,
    logger,
    gasPriceOverride,
  );
}

export async function withdrawRetryForTransferId(
  transferId: string,
  channel: FullChannelState,
  store: IEngineStore,
  chainService: IVectorChainService,
  logger: BaseLogger,
  messaging: IMessagingService,
  publicIdentifier: string,
  commitment?: WithdrawCommitment,
): Promise<Result<ChannelRpcMethodsResponsesMap[typeof ChannelRpcMethods.chan_withdrawRetry], EngineError>> {
  const method = "withdrawRetryForTransferId";
  const methodId = getRandomBytes32();
  if (!commitment) {
    const json = await store.getWithdrawalCommitment(transferId);
    if (!json) {
      return Result.fail(
        new RpcError(RpcError.reasons.WithdrawResolutionFailed, channel.channelAddress, publicIdentifier ?? "", {
          transferId: transferId,
        }),
      );
    }

    if (json.transactionHash) {
      return Result.fail(
        new RpcError(RpcError.reasons.TransactionFound, channel.channelAddress, publicIdentifier ?? "", {
          transferId: transferId,
          transactionHash: json.transactionHash,
        }),
      );
    }

    commitment = await WithdrawCommitment.fromJson(json);

    if (!json.bobSignature || !json.aliceSignature) {
      return Result.fail(
        new RpcError(RpcError.reasons.CommitmentSingleSigned, channel.channelAddress, publicIdentifier ?? "", {
          transferId: transferId,
        }),
      );
    }
  }

  // before submitting, check status
  const wasSubmitted = await chainService.getWithdrawalTransactionRecord(
    commitment.toJson(),
    channel.channelAddress,
    channel.networkContext.chainId,
  );
  if (wasSubmitted.isError) {
    logger.error(
      { method, methodId, error: jsonifyError(wasSubmitted.getError()!) },
      "Could not check submission status",
    );
    return Result.fail(wasSubmitted.getError()!);
  }
  const noOp = commitment.amount === "0" && commitment.callTo === AddressZero;
  let txHash;
  if (wasSubmitted.getValue() || noOp) {
    logger.info(
      {
        transferId,
        channelAddress: channel.channelAddress,
        commitment,
        wasSubmitted: wasSubmitted.getValue(),
        noOp,
      },
      "Previously submitted / no-op",
    );
    txHash = HashZero;
  } else {
    logger.info({ method, methodId, channelAddress: channel.channelAddress, transferId }, "Withdraw retry initiated");
    const tx = await chainService.sendWithdrawTx(channel, commitment.getSignedTransaction());
    if (tx.isError) {
      logger.error(
        { method, methodId, error: tx.getError()?.toJson(), commitment },
        "Error in chainService.sendWithdrawTx",
      );
    }
    logger.info(
      { method, methodId, transactionHash: tx.isError ? "" : tx.getValue().transactionHash },
      "Submitted unsubmitted withdrawal",
    );
    txHash = tx.getValue().transactionHash;
    await messaging.publishWithdrawalSubmittedMessage(
      getParticipant(channel, publicIdentifier) === "alice" ? channel.bobIdentifier : channel.aliceIdentifier,
      publicIdentifier,
      Result.ok({ txHash: tx.getValue().transactionHash, transferId, channelAddress: channel.channelAddress }),
    );
  }
  commitment.addTransaction(txHash);
  await store.saveWithdrawalCommitment(transferId, commitment.toJson());

  return Result.ok({
    transactionHash: txHash,
    transferId: transferId,
    channelAddress: channel.channelAddress,
  });
}

export async function submitUnsubmittedWithdrawals(
  channel: FullChannelState,
  store: IEngineStore,
  chainAddresses: ChainAddresses,
  chainService: IVectorChainService,
  logger: BaseLogger,
  messaging: IMessagingService,
  publicIdentifier: string,
): Promise<void> {
  const method = "submitUnsubmittedWithdrawals";
  const methodId = getRandomBytes32();

  const withdrawInfo = await chainService.getRegisteredTransferByName(
    TransferNames.Withdraw,
    chainAddresses[channel.networkContext.chainId].transferRegistryAddress,
    channel.networkContext.chainId,
  );
  if (withdrawInfo.isError) {
    logger.error(
      { method, methodId, error: withdrawInfo.getError()?.toJson() },
      "Error in chainService.getRegisteredTransferByName",
    );
  }

  const unsubmitted = await store.getUnsubmittedWithdrawals(channel.channelAddress, withdrawInfo.getValue().definition);
  for (const u of unsubmitted) {
    logger.info({ method, methodId, transferId: u.transfer.transferId }, "Submitting unsubmitted withdrawal");

    const commitment = await WithdrawCommitment.fromJson(u.commitment);
    const res = await withdrawRetryForTransferId(
      u.transfer.transferId,
      channel,
      store,
      chainService,
      logger,
      messaging,
      publicIdentifier,
      commitment,
    );

    if (res.isError) {
      logger.error(
        { method, methodId, error: jsonifyError(res.getError()!), commitment: u },
        "Error submitting unsubmitted withdrawal",
      );
    }
  }
}
