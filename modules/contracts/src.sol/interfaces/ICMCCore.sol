// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.7.1;
pragma experimental ABIEncoderV2;

interface ICMCCore {
  function setup(address _alice, address _bob) external;

  function getParticipants() external view returns (address[2] memory);
}
