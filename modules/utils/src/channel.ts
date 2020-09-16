import {
  Balance,
  ChannelCommitmentData,
  CoreChannelState,
  LockedValueType,
  CoreChannelStateEncoding,
} from "@connext/vector-types";
import { utils } from "ethers";

const { keccak256, solidityPack, defaultAbiCoder } = utils;

export const hashLockedValue = (value: LockedValueType): string => {
  return keccak256(solidityPack(["uint256"], [value.amount]));
};

export const hashLockedValues = (values: LockedValueType[]): string => {
  return keccak256(solidityPack(["bytes32[]"], [values.map(hashLockedValue)]));
};

export const hashBalance = (balance: Balance): string => {
  return keccak256(
    solidityPack(
      ["bytes32", "bytes32"],
      [keccak256(solidityPack(["uint256[]"], [balance.amount])), keccak256(solidityPack(["address[]"], [balance.to]))],
    ),
  );
};

export const hashBalances = (balances: Balance[]): string => {
  return keccak256(solidityPack(["bytes32[]"], [balances.map(hashBalance)]));
};

export const encodeCoreChannelState = (state: CoreChannelState): string => {
  const { lockedValue } = state;
  return defaultAbiCoder.encode(
    [CoreChannelStateEncoding],
    [{
      ...state,
      lockedBalance: lockedValue, // TODO: rename in types!
    }],
  );
};

export const hashCoreChannelState = (state: CoreChannelState): string => {
  return keccak256(solidityPack(["bytes"], [encodeCoreChannelState(state)]));
};

// TODO: is this the right hashing? Should we encode the state *then* hash?
export const hashChannelCommitment = (commitment: ChannelCommitmentData): string => {
  const channelStateHash = hashCoreChannelState(commitment.state);
  return keccak256(
    solidityPack(
      ["bytes32", "bytes[]", "address", "uint256"],
      [channelStateHash, commitment.signatures, commitment.adjudicatorAddress, commitment.chainId.toString()],
    ),
  );
};
