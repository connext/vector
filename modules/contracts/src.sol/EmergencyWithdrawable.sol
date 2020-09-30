// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.7.1;
pragma experimental ABIEncoderV2;

import "./lib/LibAsset.sol";
import "./lib/LibUtils.sol";
import "./lib/SafeMath.sol";


contract EmergencyWithdrawable {

    using SafeMath for uint256;

    mapping(address => mapping(address => uint256)) public withdrawableAmount;

    function addToEmergencyWithdrawableAmount(address assetId, address owner, uint256 amount)
        internal
    {
        withdrawableAmount[assetId][owner] += amount;
    }

    function emergencyWithdraw(address assetId, address owner, address payable recipient)
        external
    {
        require(
            msg.sender == owner || owner == recipient,
            "EmergencyWithdrawable: Either msg.sender or recipient of funds must be the owner"
        );

        uint256 maxAmount = withdrawableAmount[assetId][owner];
        uint256 balance = LibAsset.getOwnBalance(assetId);
        uint256 amount = LibUtils.min(maxAmount, balance);

        withdrawableAmount[assetId][owner] = withdrawableAmount[assetId][owner].sub(amount);

        require(
            LibAsset.transfer(assetId, recipient, amount),
            "EmergencyWithdrawable: Transfer failed"
        );
    }

}
