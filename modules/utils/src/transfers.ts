import {
  TransferState,
  CoreTransferState,
  CoreTransferStateEncoding,
  Address,
  TransferResolver,
  Balance,
  BalanceEncoding,
} from "@connext/vector-types";
import { defaultAbiCoder } from "@ethersproject/abi";
import { keccak256, sha256 } from "@ethersproject/solidity";

export const getTransferId = (
  channelAddress: Address,
  channelNonce: string,
  transferDefinition: Address,
  transferTimeout: string,
): string => keccak256(
  ["address", "address", "uint256", "uint256"],
  [transferDefinition, channelAddress, transferTimeout, channelNonce],
);

export const encodeTransferState = (state: TransferState, encoding: string): string =>
  defaultAbiCoder.encode([encoding], [state]);

export const encodeBalance = (balance: Balance): string =>
  defaultAbiCoder.encode([BalanceEncoding], [balance]);

export const encodeTransferResolver = (resolver: TransferResolver, encoding: string): string =>
  defaultAbiCoder.encode([encoding], [resolver]);

export const encodeCoreTransferState = (state: CoreTransferState): string =>
  defaultAbiCoder.encode([CoreTransferStateEncoding], [state]);

export const hashTransferState = (state: TransferState, encoding: string): string =>
  keccak256(["bytes"], [encodeTransferState(state, encoding)]);

export const hashCoreTransferState = (state: CoreTransferState): string =>
  keccak256(["bytes"], [encodeCoreTransferState(state)]);

export const createlockHash = (preImage: string): string =>
  sha256(["bytes32"], [preImage]);
