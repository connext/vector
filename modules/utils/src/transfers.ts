import { BigNumber } from "@connext/types";
import {
  LinkedTransferState,
  WithdrawState,
  TransferState,
  TransferName,
  WithdrawName,
  LinkedTransferName,
  TransferNameToStateMap,
  CoreTransferState,
  WithdrawStateEncoding,
  LinkedTransferStateEncoding,
  CoreTransferStateEncoding,
} from "@connext/vector-types";
import { utils } from "ethers";

import { stringify } from "./json";

const { keccak256, solidityPack, defaultAbiCoder } = utils;

// eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
export const isLinkedTransferState = (state: any): state is LinkedTransferState => {
  if (!state?.balance) return false;
  if (!state?.linkedHash) return false;
  return true;
};

export const encodeLinkedTransferState = (state: LinkedTransferState): string => {
  return defaultAbiCoder.encode([LinkedTransferStateEncoding], [{
    ...state,
    balance: {
      ...state.balance,
      amount: (state.balance.amount.map(a => BigNumber.from(a))),
    },
  }]);
};

export const encodeWithdrawTransferState = (state: WithdrawState): string => {
  return defaultAbiCoder.encode([WithdrawStateEncoding], [state]);
};

export const encodeCoreTransferState = (state: CoreTransferState): string => {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { transferEncodings, ...toEncode } = state;
  return defaultAbiCoder.encode([CoreTransferStateEncoding], [toEncode]);
};

// eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
export const isWithdrawState = (state: any): state is WithdrawState => {
  if (!state?.balance) return false;
  if (typeof state?.initiatorSignature !== "string") return false;
  if (!state?.signers || !Array.isArray(state?.signers)) return false;
  if (typeof state?.data !== "string") return false;
  if (typeof state?.nonce !== "string") return false;
  if (typeof state?.fee !== "string") return false;
  return true;
};

// eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
export const isTransferState = (state: any): state is TransferState => {
  return isLinkedTransferState(state) || isWithdrawState(state);
};

// eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
export const getTransferNameFromState = (state: any): TransferName => {
  if (isLinkedTransferState(state)) return LinkedTransferName;
  if (isWithdrawState(state)) return WithdrawName;
  throw new Error(`Unable to determine transfer name from state ${stringify(state)}`);
};

export function hashTransferState(name: TransferName, state: TransferNameToStateMap[typeof name]): string {
  switch (name) {
    case TransferName.LinkedTransfer: {
      return hashLinkedTransferState(state as LinkedTransferState);
    }
    case TransferName.Withdraw: {
      return hashWithdrawState(state as WithdrawState);
    }
    default: {
      throw new Error(`Unrecognized transfer name: ${name}`);
    }
  }
}

// TODO: how to include the merkle proof in the hash?
export const hashCoreTransferState = (state: CoreTransferState): string => {
  return keccak256(
    solidityPack(["address", "address", "bytes32", "address", "bytes32", "uint256"],
    [state.assetId, state.channelAddress, state.transferId, state.transferDefinition, state.initialStateHash, state.transferTimeout]
  ));
};

// TODO: correct implementation?
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export const hashLinkedTransferState = (state: LinkedTransferState): string => {
  return keccak256(solidityPack(["bytes"], [encodeLinkedTransferState(state)]));
};

// TODO: correct implementation?
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export const hashWithdrawState = (state: WithdrawState): string => {
  return keccak256(solidityPack(["bytes"], [encodeWithdrawTransferState(state)]));
};
