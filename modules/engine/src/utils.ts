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
} from "@connext/vector-types";
import { Evt } from "evt";

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
