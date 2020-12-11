import {
  Balance,
  CoreChannelState,
  CoreChannelStateEncoding,
  ChannelCommitmentTypes,
  FullChannelState,
} from "@connext/vector-types";
import { defaultAbiCoder } from "@ethersproject/abi";
import { keccak256 as solidityKeccak256 } from "@ethersproject/solidity";

export const hashBalance = (balance: Balance): string =>
  solidityKeccak256(
    ["bytes32", "bytes32"],
    [solidityKeccak256(["uint256[]"], [balance.amount]), solidityKeccak256(["address[]"], [balance.to])],
  );

export const hashBalances = (balances: Balance[]): string =>
  solidityKeccak256(["bytes32[]"], [balances.map(hashBalance)]);

export const encodeCoreChannelState = (state: CoreChannelState): string =>
  defaultAbiCoder.encode([CoreChannelStateEncoding], [state]);

export const hashCoreChannelState = (state: CoreChannelState): string =>
  solidityKeccak256(["bytes"], [encodeCoreChannelState(state)]);

export const hashChannelCommitment = (state: CoreChannelState): string =>
  solidityKeccak256(
    ["bytes"],
    [defaultAbiCoder.encode(["uint8", "bytes32"], [ChannelCommitmentTypes.ChannelState, hashCoreChannelState(state)])],
  );

export const getBalanceForAssetId = (
  channel: FullChannelState,
  assetId: string,
  participant: "alice" | "bob",
): string => {
  const assetIdx = channel.assetIds.findIndex((a) => a === assetId);
  if (assetIdx === -1) {
    return "0";
  }
  return channel.balances[assetIdx].amount[participant === "alice" ? 0 : 1];
};
