// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.7.1;
pragma experimental ABIEncoderV2;

import "./Types.sol";
import "./IAdjudicator.sol";


interface IVectorChannel { // is IAdjudicator? {

    function setup(
        address[2] memory owners
    ) external;

    function getOwners(
    ) external view returns (address[2] memory);

    function getBalance(
        address assetAddress
    ) external view returns (uint256);

    function depositA(
        address assetAddress,
        uint256 amount
        // bytes memory signature
    ) external payable;

    function latestDepositByAssetAddress(
        address assetAddress
    ) external view returns (LatestDeposit memory);

    function managedTransfer(
        Balance memory balances,
        address assetAddress
    ) external;

    function execTransaction(
        address to,
        uint256 value,
        bytes memory data,
        uint256 nonce,
        bytes[] memory signatures
    ) external;

}
