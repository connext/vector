// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.7.1;
pragma experimental ABIEncoderV2;

import "./lib/LibAsset.sol";


contract Withdrawable {

    using LibAsset for address;

    mapping(address => mapping(address => uint256)) public withdrawableAmount;

    function addToWithdrawableAmount(address assetId, address owner, uint256 amount)
        internal
    {
        withdrawableAmount[assetId][owner] += amount;
    }

    function withdraw(address assetId, address owner, address payable recipient)
        external
    {
        require(
            msg.sender == owner || owner == recipient,
            "Withdrawable: Either msg.sender or recipient of funds must be the owner"
        );
        uint256 amount = withdrawableAmount[assetId][owner];
        withdrawableAmount[assetId][owner] = 0;
        (bool success, ) = assetId.transferUpTo(recipient, amount);
        require(
            success,
            "Withdrawable: Transfer failed"
        );
    }

}
