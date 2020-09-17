import {
  Balance,
  ChannelCommitmentData,
  CoreChannelState,
  CoreChannelStateEncoding,
} from "@connext/vector-types";
import { utils } from "ethers";

const { keccak256, solidityPack, defaultAbiCoder } = utils;

export const hashlockedBalance = (value: string): string => {
  return keccak256(solidityPack(["uint256"], [value]));
};

export const hashlockedBalances = (values: string[]): string => {
  return keccak256(solidityPack(["bytes32[]"], [values.map(hashlockedBalance)]));
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
  return defaultAbiCoder.encode(
    [CoreChannelStateEncoding],
    [state],
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
