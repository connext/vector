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
        uint256[] defundNonces;
        uint256 timeout;
        uint256 nonce;
        bytes32 merkleRoot;
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
    }

    struct TransferDispute {
        bytes32 transferStateHash;
        uint256 transferDisputeExpiry;
        bool isDefunded;
    }

    event ChannelDisputed(
        address disputer,
        address channelAddress,
        ChannelDispute dispute
    );

    event ChannelDefunded(
        address defunder,
        address channelAddress,
        ChannelDispute dispute,
        address[] assetIds,
        uint256[] indices
    );

    event TransferDisputed(
        address disputer,
        address channelAddress,
        bytes32 transferId,
        TransferDispute dispute
    );

    event TransferDefunded(
        address defunder,
        address channelAddress,
        TransferDispute dispute,
        bytes encodedInitialState,
        bytes encodedResolver,
        Balance balance
    );

    function getChannelDispute() external view returns (ChannelDispute memory);

    function getDefundNonce(address assetId) external view returns (uint256);

    function getTransferDispute(bytes32 transferId)
        external
        view
        returns (TransferDispute memory);

    function disputeChannel(
        CoreChannelState calldata ccs,
        bytes calldata aliceSignature,
        bytes calldata bobSignature
    ) external;

    function defundChannel(
        CoreChannelState calldata ccs,
        address[] calldata assetIds,
        uint256[] calldata indices
    ) external;

    function disputeTransfer(
        CoreTransferState calldata cts,
        bytes32[] calldata merkleProofData
    ) external;

    function defundTransfer(
        CoreTransferState calldata cts,
        bytes calldata encodedInitialTransferState,
        bytes calldata encodedTransferResolver,
        bytes calldata responderSignature
    ) external;
}
