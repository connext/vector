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
  LinkedTransferResolverEncoding,
  LinkedTransferResolver,
  Address,
} from "@connext/vector-types";
import { utils } from "ethers";

import { stringify } from "./json";

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

// eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
export const isLinkedTransferState = (state: any): state is LinkedTransferState => {
  if (!state?.balance) return false;
  if (!state?.linkedHash) return false;
  return true;
};

export const encodeLinkedTransferState = (state: LinkedTransferState): string => {
  return defaultAbiCoder.encode([LinkedTransferStateEncoding], [state]);
};

export const encodeLinkedTransferResolver = (resoler: LinkedTransferResolver): string => {
  return defaultAbiCoder.encode([LinkedTransferResolverEncoding], [resoler]);
};

export const encodeWithdrawTransferState = (state: WithdrawState): string => {
  return defaultAbiCoder.encode([WithdrawStateEncoding], [state]);
};

export const encodeCoreTransferState = (state: CoreTransferState): string => {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  return defaultAbiCoder.encode([CoreTransferStateEncoding], [state]);
};

export function hashTransferState(state: TransferState, encoding: string): string {
  return keccak256(solidityPack(["bytes"], [defaultAbiCoder.encode([encoding], [state])]));
}

// TODO: how to include the merkle proof in the hash?
export const hashCoreTransferState = (state: CoreTransferState): string => {
  return keccak256(solidityPack(["bytes"], [encodeCoreTransferState(state)]));
};

export const createLinkedHash = (preImage: string): string => {
  return utils.soliditySha256(["bytes32"], [preImage]);
};
