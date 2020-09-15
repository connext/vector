// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.7.1;
pragma experimental ABIEncoderV2;

import "./IAdjudicator.sol";
import "./Types.sol";


interface IVectorChannel {

    function getBalance(
        address assetId
    ) external view returns (uint256);

    function latestDepositByAssetId(
        address assetId
    ) external view returns (LatestDeposit memory);

    function setup(
        address[2] memory owners,
        IAdjudicator adjudicator
    ) external;

    function depositA(
        address assetId,
        uint256 amount
        // bytes memory signature
    ) external payable;

    function adjudicatorTransfer(
        Balance memory balances,
        address assetId
    ) external;

    function execTransaction(
        address to,
        uint256 value,
        bytes memory data,
        bytes[] memory signatures
    ) external;

}
