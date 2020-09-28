// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.7.1;
pragma experimental ABIEncoderV2;

import "./lib/LibAsset.sol";
import "./Withdrawable.sol";


contract AssetTransfer is Withdrawable {

    using LibAsset for address;

    mapping(address => uint256) private totalWithdrawn;

    function getTotalWithdrawn(address assetId) public view returns (uint256) {
        return totalWithdrawn[assetId];
    }

    function registerTransfer(address assetId, uint256 amount) internal {
        totalWithdrawn[assetId] += amount;
    }

    function transferAsset(address assetId, address payable recipient, uint256 maxAmount)
        internal
        returns (bool)
    {
        (bool success, uint256 amount) = assetId.transferUpTo(recipient, maxAmount);
        registerTransfer(assetId, amount);
        if (!success) {
            // make withdrawable
        }
        return true;
    }

}
