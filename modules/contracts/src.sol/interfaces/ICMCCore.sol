// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.7.1;
pragma experimental ABIEncoderV2;

import "./Types.sol";


interface ICMCCore {

    function setup(
        address[2] memory _participants
    ) external;

    function getParticipants(
    ) external view returns (address[2] memory);

}
