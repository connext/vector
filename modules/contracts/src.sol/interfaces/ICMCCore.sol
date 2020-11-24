// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.7.1;
pragma experimental ABIEncoderV2;

interface ICMCCore {
    function setup(address _alice, address _bob) external;

    function getAlice() external view returns (address);

    function getBob() external view returns (address);
}
