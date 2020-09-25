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
    address[] assetIds;
    Balance[] balances; // TODO index by assetId? // alice, bob
    address channelAddress;
    bytes32 merkleRoot;
    uint256 nonce;
    address[2] participants; // Signer keys -- does NOT have to be the same as balances.to[]
    string[] processedDepositsA; // indexed by assetId
    string[] processedDepositsB; // indexed by assetId
    uint256 timeout;
}

struct CoreTransferState {
    Balance initialBalance;
    address assetId;
    address channelAddress;
    bytes32 transferId;
    address transferDefinition;
    uint256 transferTimeout;
    bytes32 initialStateHash;
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
