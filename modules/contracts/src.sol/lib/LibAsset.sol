// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.7.1;
pragma experimental ABIEncoderV2;

import "./LibERC20.sol";
import "./LibUtils.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

library LibAsset {
  address constant ETHER_ASSETID = address(0);

  function isEther(address assetId) internal pure returns (bool) {
    return assetId == ETHER_ASSETID;
  }

  function getOwnBalance(address assetId) internal view returns (uint256) {
    return isEther(assetId) ? address(this).balance : IERC20(assetId).balanceOf(address(this));
  }

  function transferEther(address payable recipient, uint256 amount) internal returns (bool) {
    (bool success, bytes memory returnData) = recipient.call{value: amount}("");
    LibUtils.revertIfCallFailed(success, returnData);
    return true;
  }

  function transferERC20(
    address assetId,
    address recipient,
    uint256 amount
  ) internal returns (bool) {
    return LibERC20.transfer(assetId, recipient, amount);
  }

  // This function is a wrapper for transfers of Ether or ERC20 tokens,
  // both standard-compliant ones as well as tokens that exhibit the
  // missing-return-value bug.
  // Although it behaves very much like Solidity's `transfer` function
  // or the ERC20 `transfer` and is, in fact, designed to replace direct
  // usage of those, it is deliberately named `unregisteredTransfer`,
  // because we need to register every transfer out of the channel.
  // Therefore, it should normally not be used directly, with the single
  // exception of the `transferAsset` function in `CMCAsset.sol`,
  // which combines the "naked" unregistered transfer given below
  // with a registration.
  // USING THIS FUNCTION SOMEWHERE ELSE IS PROBABLY WRONG!
  function unregisteredTransfer(
    address assetId,
    address payable recipient,
    uint256 amount
  ) internal returns (bool) {
    return isEther(assetId) ? transferEther(recipient, amount) : transferERC20(assetId, recipient, amount);
  }
}
