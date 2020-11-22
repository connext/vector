// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.7.1;
pragma experimental ABIEncoderV2;

interface ICMCAsset {
  function getTotalTransferred(address assetId) external view returns (uint256);

  function getEmergencyWithdrawableAmount(address assetId, address owner) external view returns (uint256);

  function emergencyWithdraw(
    address assetId,
    address owner,
    address payable recipient
  ) external;
}
