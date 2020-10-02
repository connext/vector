// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.7.1;
pragma experimental ABIEncoderV2;

struct Balance {
  uint256[2] amount;
  address payable[2] to;
}

struct LatestDeposit {
  uint256 amount;
  uint256 nonce;
}

struct CoreChannelState {
  Balance[] balances; // TODO index by assetId? // alice, bob
  address[] assetIds;
  address channelAddress;
  address alice;
  address bob;
  uint256[] processedDepositsA; // indexed by assetId
  uint256[] processedDepositsB; // indexed by assetId
  uint256 timeout;
  uint256 nonce;
  bytes32 merkleRoot;
}

struct CoreTransferState {
  Balance initialBalance;
  address assetId;
  address channelAddress;
  bytes32 transferId;
  address transferDefinition;
  uint256 transferTimeout;
  bytes32 initialStateHash;
  address initiator;
  address responder;
}

struct ChannelDispute {
  bytes32 channelStateHash;
  uint256 nonce;
  bytes32 merkleRoot;
  uint256 consensusExpiry;
  uint256 defundExpiry;
  bool isDefunded;
}

struct TransferDispute {
  uint256 transferDisputeExpiry;
  bytes32 transferStateHash;
  bool isDefunded;
}
