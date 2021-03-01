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
  TransactionEvents,
  TransactionSubmittedPayload,
  TransactionMinedPayload,
  TransactionFailedPayload,
  IVectorChainReader,
  Result,
} from "@connext/vector-types";
import { FeeCalculationError, normalizeFee } from "@connext/vector-utils";
import { BigNumber } from "@ethersproject/bignumber";
import { Evt } from "evt";
import { BaseLogger } from "pino";

import { EngineEvtContainer } from "./index";

export const getEngineEvtContainer = (): EngineEvtContainer => {
  return {
    [EngineEvents.IS_ALIVE]: Evt.create<IsAlivePayload>(),
    [EngineEvents.SETUP]: Evt.create<SetupPayload>(),
    [EngineEvents.CONDITIONAL_TRANSFER_CREATED]: Evt.create<ConditionalTransferCreatedPayload>(),
    [EngineEvents.CONDITIONAL_TRANSFER_RESOLVED]: Evt.create<ConditionalTransferResolvedPayload>(),
    [EngineEvents.DEPOSIT_RECONCILED]: Evt.create<DepositReconciledPayload>(),
    [EngineEvents.REQUEST_COLLATERAL]: Evt.create<RequestCollateralPayload>(),
    [EngineEvents.RESTORE_STATE_EVENT]: Evt.create<RestoreStatePayload>(),
    [EngineEvents.WITHDRAWAL_CREATED]: Evt.create<WithdrawalCreatedPayload>(),
    [EngineEvents.WITHDRAWAL_RESOLVED]: Evt.create<WithdrawalResolvedPayload>(),
    [EngineEvents.WITHDRAWAL_RECONCILED]: Evt.create<WithdrawalReconciledPayload>(),
    [TransactionEvents.TRANSACTION_SUBMITTED]: Evt.create<TransactionSubmittedPayload & { publicIdentifier: string }>(),
    [TransactionEvents.TRANSACTION_MINED]: Evt.create<TransactionMinedPayload & { publicIdentifier: string }>(),
    [TransactionEvents.TRANSACTION_FAILED]: Evt.create<TransactionFailedPayload & { publicIdentifier: string }>(),
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
