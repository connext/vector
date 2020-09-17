// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.7.1;
pragma experimental ABIEncoderV2;

import "./Types.sol";


interface IVectorChannel {

    function setup(
        address[2] memory owners
    ) external;

    function getBalance(
        address assetId
    ) external view returns (uint256);

    function latestDepositByAssetId(
        address assetId
    ) external view returns (LatestDeposit memory);

    function depositA(
        address assetId,
        uint256 amount
        // bytes memory signature
    ) external payable;

    function managedTransfer(
        Balance memory balances,
        address assetId
    ) external;

    function execTransaction(
        address to,
        uint256 value,
        bytes memory data,
        uint256 nonce,
        bytes[] memory signatures
    ) external;

    function getOwners(
    ) external view returns (address[2] memory);

}
