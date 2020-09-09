// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.7.1;
pragma experimental ABIEncoderV2;


interface IAdjudicator {

    function forceChannelConsensus() external;

    function defundChannel() external;

    function forceTransferConsensus() external;

    function defundTransfer() external;

    // function setTransferResolution() external;

}
