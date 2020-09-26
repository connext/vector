import {
  Balance,
  ChannelCommitmentData,
  CoreChannelState,
  CoreChannelStateEncoding,
} from "@connext/vector-types";
import { utils } from "ethers";

const { keccak256, solidityPack, defaultAbiCoder } = utils;

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

export const hashChannelCommitment = (commitment: ChannelCommitmentData): string => {
  const channelStateHash = hashCoreChannelState(commitment.state);
  return keccak256(
    solidityPack(
      ["bytes32", "bytes[]", "address", "uint256"],
      [channelStateHash, commitment.signatures, commitment.channelFactoryAddress, commitment.chainId.toString()],
    ),
  );
};
