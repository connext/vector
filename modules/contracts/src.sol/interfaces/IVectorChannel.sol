// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.7.1;
pragma experimental ABIEncoderV2;

import "./Types.sol";
import "./IAdjudicator.sol";


interface IVectorChannel { // is IAdjudicator {

    function setup(
        address[2] memory participants,
        address adjudicator
    ) external;

    function getParticipants(
    ) external view returns (address[2] memory);

    function getBalance(
        address assetId
    ) external view returns (uint256);

    function depositA(
        address assetId,
        uint256 amount
        // bytes memory signature
    ) external payable;

    function latestDepositByAssetId(
        address assetId
    ) external view returns (LatestDeposit memory);

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

}
