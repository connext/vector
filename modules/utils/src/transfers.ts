import {
  HashlockTransferState,
  WithdrawState,
  TransferState,
  CoreTransferState,
  WithdrawStateEncoding,
  HashlockTransferStateEncoding,
  CoreTransferStateEncoding,
  HashlockTransferResolverEncoding,
  HashlockTransferResolver,
  Address,
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

export const encodeHashlockTransferState = (state: HashlockTransferState): string => {
  return defaultAbiCoder.encode([HashlockTransferStateEncoding], [state]);
};

export const encodeHashlockTransferResolver = (resoler: HashlockTransferResolver): string => {
  return defaultAbiCoder.encode([HashlockTransferResolverEncoding], [resoler]);
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

export const hashCoreTransferState = (state: CoreTransferState): string => {
  return keccak256(solidityPack(["bytes"], [encodeCoreTransferState(state)]));
};

export const createlockHash = (preImage: string): string => {
  return utils.soliditySha256(["bytes32"], [preImage]);
};
