// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.7.1;
pragma experimental ABIEncoderV2;

interface IChannelMiddleware {
  function getMastercopy() external view returns (address);
}
