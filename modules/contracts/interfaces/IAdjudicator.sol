// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.7.1;
pragma experimental ABIEncoderV2;


interface IAdjudicator {

    function forceChannelConsensus() external;

    function emptyChannel() external;

    function emptyTransfer() external;

    function setTransferResolution() external;

}
