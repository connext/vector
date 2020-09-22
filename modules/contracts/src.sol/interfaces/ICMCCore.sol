// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.7.1;
pragma experimental ABIEncoderV2;

import "./Types.sol";


interface ICMCCore {

    function setup(
        address[2] memory participants,
        address adjudicator
    ) external;

    function getBalance(
        address assetId
    ) external view returns (uint256);

    function getParticipants(
    ) external view returns (address[2] memory);

    function managedTransfer(
        Balance memory balances,
        address assetId
    ) external;

}
