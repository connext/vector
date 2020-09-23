// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.7.1;
pragma experimental ABIEncoderV2;

import "./Types.sol";


interface ICMCDeposit {

    event Deposit(
      address assetId,
      uint256 amount
    );

    function getLatestDeposit(
        address assetId
    ) external view returns (LatestDeposit memory);

    function initiatorDeposit(
        address assetId,
        uint256 amount
        // bytes memory signature
    ) external payable;

}
