import {
  Balance,
  ChannelCommitmentData,
  CoreChannelState,
  CoreChannelStateEncoding,
  ChannelCommitmentTypes,
} from "@connext/vector-types";
import { defaultAbiCoder } from "@ethersproject/abi";
import { keccak256 } from "@ethersproject/solidity";

export const hashBalance = (balance: Balance): string =>
  keccak256(
    ["bytes32", "bytes32"],
    [keccak256(["uint256[]"], [balance.amount]), keccak256(["address[]"], [balance.to])],
  );

export const hashBalances = (balances: Balance[]): string => keccak256(["bytes32[]"], [balances.map(hashBalance)]);

export const encodeCoreChannelState = (state: CoreChannelState): string =>
  defaultAbiCoder.encode([CoreChannelStateEncoding], [state]);

export const hashCoreChannelState = (state: CoreChannelState): string =>
  keccak256(["bytes"], [encodeCoreChannelState(state)]);

// FIXME: why is this like this
// export const hashChannelCommitment = (commitment: ChannelCommitmentData): string => keccak256(
//   ["bytes32", "address", "uint256"],
//   [hashCoreChannelState(commitment.state), commitment.channelFactoryAddress, commitment.chainId.toString()],
// );
export const hashChannelCommitment = (commitment: ChannelCommitmentData): string => {
  const encoded = defaultAbiCoder.encode(
    ["uint", "bytes"],
    [ChannelCommitmentTypes.ChannelState, hashCoreChannelState(commitment.state)],
  );
  return keccak256(["bytes"], [encoded]);
};

export const getBalanceForAssetId = (
  channel: CoreChannelState,
  assetId: string,
  participant: "alice" | "bob",
): string => {
  const assetIdx = channel.assetIds.findIndex(a => a === assetId);
  if (assetIdx === -1) {
    return "0";
  }
  return channel.balances[assetIdx].amount[participant === "alice" ? 0 : 1];
};
