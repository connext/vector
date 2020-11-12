// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.7.1;
pragma experimental ABIEncoderV2;

import "./LibERC20.sol";
import "./LibUtils.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";


library LibAsset {

    address constant ETHER_ASSETID = address(0);

    function isEther(address assetId)
        internal
        pure
        returns (bool)
    {
        return assetId == ETHER_ASSETID;
    }

    function getOwnBalance(address assetId)
        internal
        view
        returns (uint256)
    {
        return isEther(assetId) ?
            address(this).balance :
            IERC20(assetId).balanceOf(address(this));
    }

    function transferEther(address payable recipient, uint256 amount)
        internal
        returns (bool)
    {
        (bool success, bytes memory returnData) = recipient.call{value: amount}("");
        LibUtils.revertIfCallFailed(success, returnData);
        return true;
    }

    function transferERC20(address assetId, address recipient, uint256 amount)
        internal
        returns (bool)
    {
        return LibERC20.transfer(assetId, recipient, amount);
    }

    function transfer(address assetId, address payable recipient, uint256 amount)
        internal
        returns (bool)
    {
        return isEther(assetId) ?
            transferEther(recipient, amount) :
            transferERC20(assetId, recipient, amount);
    }

}
