// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.7.1;
pragma experimental ABIEncoderV2;

struct Balance {
  uint256[2] amount;
  address payable[2] to;
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
  uint256 defundNonce;
}

struct CoreTransferState {
  Balance balance;
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
  uint256 defundNonce;
}

struct TransferDispute {
  bytes32 transferStateHash;
  uint256 transferDisputeExpiry;
  bool isDefunded;
}

struct RegisteredTransfer {
  string name;
  address definition;
  string stateEncoding;
  string resolverEncoding;
}
