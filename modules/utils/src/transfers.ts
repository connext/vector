import {
  TransferState,
  CoreTransferState,
  CoreTransferStateEncoding,
  Address,
  TransferResolver,
  Balance,
  BalanceEncoding,
} from "@connext/vector-types";
import { utils } from "ethers";

const { keccak256, solidityPack, defaultAbiCoder } = utils;

export const getTransferId = (
  channelAddress: Address,
  channelNonce: string,
  transferDefinition: Address,
  transferTimeout: string,
): string => {
  return keccak256(
    solidityPack(
      ["address", "address", "uint256", "uint256"],
      [transferDefinition, channelAddress, transferTimeout, channelNonce],
    ),
  );
};

export const encodeTransferState = (state: TransferState, encoding: string): string => {
  return defaultAbiCoder.encode([encoding], [state]);
};

export const encodeBalance = (balance: Balance): string => {
  return defaultAbiCoder.encode([BalanceEncoding], [balance]);
};

export const encodeTransferResolver = (resolver: TransferResolver, encoding: string): string => {
  return defaultAbiCoder.encode([encoding], [resolver]);
};

export const encodeCoreTransferState = (state: CoreTransferState): string => {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  return defaultAbiCoder.encode([CoreTransferStateEncoding], [state]);
};

export function hashTransferState(state: TransferState, encoding: string): string {
  return keccak256(solidityPack(["bytes"], [encodeTransferState(state, encoding)]));
}

export const hashCoreTransferState = (state: CoreTransferState): string => {
  return keccak256(solidityPack(["bytes"], [encodeCoreTransferState(state)]));
};

export const createlockHash = (preImage: string): string => {
  return utils.soliditySha256(["bytes32"], [preImage]);
};
