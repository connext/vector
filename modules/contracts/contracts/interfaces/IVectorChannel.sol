// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.7.1;
pragma experimental ABIEncoderV2;


interface IVectorChannel {

    struct Balances {
        uint256 amount;
        address assetId;
    }

    function depositA(
        uint256 amount,
        address assetId
        // bytes memory signature
    ) external payable;

    function adjudicatorTransfer(
        Balances[] memory balances,
        address assetId
    ) external;

    function execTransaction(
        address to,
        uint256 value,
        bytes memory data,
        bytes[] memory signatures
    ) external;

}
