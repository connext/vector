// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.7.1;
pragma experimental ABIEncoderV2;


interface IChannel {

    function depositA(
        uint256 amount,
        address assetId,
        bytes memory signature
    ) external payable;

    function adjudicatorTransfer(
        address[] memory to,
        uint256[] memory amount,
        address assetId
    ) external;

    function execTransaction(
        address to,
        uint256 value,
        bytes memory data,
        bytes[] memory signatures
    ) external;

}
