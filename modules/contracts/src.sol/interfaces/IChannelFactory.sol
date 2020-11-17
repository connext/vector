// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.7.1;
pragma experimental ABIEncoderV2;

interface IChannelFactory {
  event ChannelCreation(address channel);

  function getMastercopy() external view returns (address);

  function getMiddleware() external view returns (address);

  function proxyCreationCode() external view returns (bytes memory);

  function getChannelAddress(
    address alice,
    address bob,
    uint256 chainId
  ) external view returns (address);

  function createChannel(
    address alice,
    address bob,
    uint256 chainId
  ) external returns (address);

  function createChannelAndDepositAlice(
    address alice,
    address bob,
    uint256 chainId,
    address assetId,
    uint256 amount
  ) external payable returns (address);
}
