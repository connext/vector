import {
  ConditionalTransferCreatedPayload,
  ConditionalTransferResolvedPayload,
  DepositReconciledPayload,
  WithdrawalCreatedPayload,
  WithdrawalResolvedPayload,
  WithdrawalReconciledPayload,
  CONDITIONAL_TRANSFER_CREATED_EVENT,
  CONDITIONAL_TRANSFER_RESOLVED_EVENT,
  DEPOSIT_RECONCILED_EVENT,
  WITHDRAWAL_CREATED_EVENT,
  WITHDRAWAL_RESOLVED_EVENT,
  WITHDRAWAL_RECONCILED_EVENT,
  ContractAddresses,
  Result,
  TransferName,
} from "@connext/vector-types";
import { Evt } from "evt";

import { InvalidTransferType } from "./errors";

import { EngineEvtContainer } from "./index";

export const getEngineEvtContainer = (): EngineEvtContainer => {
  return {
    [CONDITIONAL_TRANSFER_CREATED_EVENT]: Evt.create<ConditionalTransferCreatedPayload>(),
    [CONDITIONAL_TRANSFER_RESOLVED_EVENT]: Evt.create<ConditionalTransferResolvedPayload>(),
    [DEPOSIT_RECONCILED_EVENT]: Evt.create<DepositReconciledPayload>(),
    [WITHDRAWAL_CREATED_EVENT]: Evt.create<WithdrawalCreatedPayload>(),
    [WITHDRAWAL_RESOLVED_EVENT]: Evt.create<WithdrawalResolvedPayload>(),
    [WITHDRAWAL_RECONCILED_EVENT]: Evt.create<WithdrawalReconciledPayload>(),
  };
};

export const getTransferNameFromType = (
  type: string,
  context: ContractAddresses,
): Result<TransferName, InvalidTransferType> => {
  const entry = Object.entries(context).find(([name, value]) => {
    return type === name || type === value;
  });
  if (!entry) {
    return Result.fail(new InvalidTransferType(type));
  }
  return Result.ok(entry[0] as TransferName);
};
