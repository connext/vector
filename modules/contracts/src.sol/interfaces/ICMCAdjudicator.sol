// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.7.1;
pragma experimental ABIEncoderV2;

import "./Types.sol";


interface ICMCAdjudicator {

    struct CoreChannelState {
      address channelAddress;
      address alice;
      address bob;
      address[] assetIds;
      Balance[] balances;
      uint256[] processedDepositsA;
      uint256[] processedDepositsB;
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

    function getChannelDispute(
    ) external view returns (ChannelDispute memory);

    function getTransferDispute(
        bytes32 transferId
    ) external view returns (TransferDispute memory);

    function disputeChannel(
        CoreChannelState calldata ccs,
        bytes calldata aliceSignature,
        bytes calldata bobSignature
    ) external;

    function defundChannel(
        CoreChannelState calldata ccs
    ) external;

    function disputeTransfer(
        CoreTransferState calldata cts,
        bytes32[] calldata merkleProofData
    ) external;

    function defundTransfer(
        CoreTransferState calldata cts,
        bytes calldata encodedInitialTransferState,
        bytes calldata encodedTransferResolver
    ) external;

}
