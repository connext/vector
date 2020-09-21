// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.7.1;
pragma experimental ABIEncoderV2;

import "./Types.sol";


interface IAdjudicator {

    struct CoreChannelState {
        Balance[] balances; // TODO index by assetId? // initiator, responder
        uint256[] lockedBalance; // Indexed by assetId -- should always be changed in lockstep with transfers
        address[] assetIds;
        // TODO: The channelAddress needs to be derived from the participants (and chainId, factory address, etc.); otherwise Alice and Bob can control someone else's channel...
        // Maybe we should really put the adjudication logic into the VectorChannel; then we don't need to compute the address onchain and, in general, don't need to
        // worry aboout the adjudicator releasing the wrong (i.e. someone else's) funds.?
        address channelAddress;
        address[2] participants; // Signer keys -- does NOT have to be the same as balances.to[]
        uint256 timeout;
        uint256 nonce;
        uint256 latestDepositNonce;
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
    }

    function forceChannelConsensus(
        CoreChannelState memory ccs,
        bytes[2] memory signatures
    ) external;


    function defundChannel(
        CoreChannelState memory ccs
    ) external;


    function forceTransferConsensus(
        CoreTransferState memory cts,
        bytes32[] memory merkeProofData
    ) external;

    function defundTransfer(
        CoreTransferState memory cts,
        bytes memory encodedInitialTransferState,
        bytes memory encodedTransferResolver
    ) external;

    // function setTransferResolution() external;

}
