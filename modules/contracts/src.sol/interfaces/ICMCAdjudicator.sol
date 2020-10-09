// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.7.1;
pragma experimental ABIEncoderV2;

import "./Types.sol";


interface ICMCAdjudicator {

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
