// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.7.1;
pragma experimental ABIEncoderV2;

import "./Types.sol";


interface ICMCAdjudicator {

    function getLatestChannelDispute(
    ) external returns (ChannelDispute memory);

    function getLatestTransferDispute(
    ) external returns (TransferDispute memory);

    function disputeChannel(
        CoreChannelState memory ccs,
        bytes[2] memory signatures
    ) external;


    function defundChannel(
        CoreChannelState memory ccs
    ) external;


    function disputeTransfer(
        CoreTransferState memory cts,
        bytes32[] memory merkeProofData
    ) external;

    function defundTransfer(
        CoreTransferState memory cts,
        bytes memory encodedInitialTransferState,
        bytes memory encodedTransferResolver
    ) external;

}
