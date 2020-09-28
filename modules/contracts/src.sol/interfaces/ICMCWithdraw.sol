// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.7.1;
pragma experimental ABIEncoderV2;


interface ICMCWithdraw {

    function withdraw(
        address payable recipient,
        address assetId,
        uint256 amount,
        uint256 nonce,
        bytes memory aliceSignature,
        bytes memory bobSignature
    ) external;

}
