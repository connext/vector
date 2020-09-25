// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.7.1;
pragma experimental ABIEncoderV2;

import "./Types.sol";
import "./IAdjudicator.sol";

interface IVectorChannel {
  // is IAdjudicator? {

  function setup(address[2] memory owners) external;

  function getOwners() external view returns (address[2] memory);

  function getBalance(address assetId) external view returns (uint256);

  function depositA(
    address assetId,
    uint256 amount
    // bytes memory signature
  ) external payable;

  function totalDepositedA(address assetId) external view returns (uint256);

  function totalDepositedB(address assetId) external view returns (uint256);

  function managedTransfer(Balance memory balances, address assetId) external;

  function execWithdraw(
    address recipient,
    uint256 amount,
    address assetId,
    bytes memory data,
    uint256 nonce,
    bytes[] memory signatures
  ) external;
}
