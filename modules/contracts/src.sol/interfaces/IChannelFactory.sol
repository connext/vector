// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.7.1;
pragma experimental ABIEncoderV2;

interface IChannelFactory {
  event ChannelCreation(address channel);

  function getMastercopy() external view returns (address);

  function getChainId() external view returns (uint256);

  function getStoredChainId() external view returns (uint256);

  function proxyCreationCode() external view returns (bytes memory);

  function getChannelAddress(address alice, address bob) external view returns (address);

  function createChannel(address alice, address bob) external returns (address);

  function createChannelAndDepositAlice(
    address alice,
    address bob,
    address assetId,
    uint256 amount
  ) external payable returns (address);
}
