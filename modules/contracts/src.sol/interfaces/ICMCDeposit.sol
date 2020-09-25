// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.7.1;
pragma experimental ABIEncoderV2;

import "./Types.sol";


interface ICMCDeposit {

    function totalDepositedA(address assetId) external view returns (uint256);

    function totalDepositedB(address assetId) external view returns (uint256);

    function depositA(
        address assetId,
        uint256 amount
        // bytes memory signature
    ) external payable;

}
