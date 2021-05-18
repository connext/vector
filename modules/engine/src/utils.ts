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
} from "@connext/vector-types";
import { WithdrawCommitment } from "@connext/vector-contracts";
import { FeeCalculationError, normalizeFee, getRandomBytes32 } from "@connext/vector-utils";
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

export async function withdrawRetryForTrasferId(
  transferId: string,
  channel: FullChannelState,
  store: IEngineStore,
  chainService: IVectorChainService,
  logger: BaseLogger,
  publicIdentifier?: string,
  commitment?: WithdrawCommitment,
): Promise<Result<ChannelRpcMethodsResponsesMap[typeof ChannelRpcMethods.chan_withdrawRetry], EngineError>> {
  let _commitment = commitment;
  if (!_commitment) {
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

    _commitment = await WithdrawCommitment.fromJson(json);

    if (!json.bobSignature || !json.aliceSignature) {
      return Result.fail(
        new RpcError(RpcError.reasons.CommitmentSingleSigned, channel.channelAddress, publicIdentifier ?? "", {
          transferId: transferId,
        }),
      );
    }
  }

  logger.info({ channelAddress: channel.channelAddress, transferId: transferId }, "Withdraw retry initiated");
  const transaction = await chainService.sendWithdrawTx(channel, _commitment.getSignedTransaction());
  if (transaction.isError) {
    return Result.fail(transaction.getError()!);
  }
  const txHash = transaction.getValue().transactionHash;
  commitment!.addTransaction(txHash);
  await store.saveWithdrawalCommitment(transferId, _commitment!.toJson());

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
    const res = await withdrawRetryForTrasferId(
      u.transfer.transferId,
      channel,
      store,
      chainService,
      logger,
      "",
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
