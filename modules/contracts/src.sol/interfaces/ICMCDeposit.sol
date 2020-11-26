// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.7.1;
pragma experimental ABIEncoderV2;

interface ICMCDeposit {
    event AliceDeposited(address assetId, uint256 amount);
    
    function getTotalDepositsAlice(address assetId)
        external
        view
        returns (uint256);

    function getTotalDepositsBob(address assetId)
        external
        view
        returns (uint256);

    function depositAlice(address assetId, uint256 amount) external payable;
}
