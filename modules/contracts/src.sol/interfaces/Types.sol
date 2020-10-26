// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.7.1;
pragma experimental ABIEncoderV2;

struct Balance {
  uint256[2] amount; // [alice, bob] in channel, [initiator, responder] in transfer
  address payable[2] to; // [alice, bob] in channel, [initiator, responder] in transfer
}

struct CoreChannelState {
  address channelAddress;
  address alice;
  address bob;
  address[] assetIds;
  Balance[] balances; // indexed by assetId
  uint256[] processedDepositsA; // indexed by assetId
  uint256[] processedDepositsB; // indexed by assetId
  uint256 timeout;
  uint256 nonce;
  bytes32 merkleRoot;
  uint256 defundNonce;
}

struct CoreTransferState {
  address channelAddress;
  bytes32 transferId;
  address transferDefinition;
  address initiator;
  address responder;
  address assetId;
  Balance balance;
  uint256 transferTimeout;
  bytes32 initialStateHash;
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
