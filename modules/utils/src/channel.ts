import { Balance, ChannelCommitmentData, CoreChannelState, LockedValueType } from "@connext/vector-types";
import { utils } from "ethers";

const { keccak256, solidityPack } = utils;

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

export const hashCoreChannelState = (state: CoreChannelState): string => {
  return keccak256(
    solidityPack(
      ["address", "bytes32", "uint256", "bytes32", "bytes32", "bytes32", "uint256", "uint256", "bytes"],
      [
        state.channelAddress,
        keccak256(solidityPack(["address[]"], [state.participants])),
        state.timeout,
        hashBalances(state.balances),
        hashLockedValues(state.lockedValue),
        keccak256(solidityPack(["address[]"], [state.assetIds])),
        state.nonce.toString(),
        state.latestDepositNonce.toString(),
        state.merkleRoot,
      ],
    ),
  );
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
