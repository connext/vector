// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.7.1;
pragma experimental ABIEncoderV2;

import "./interfaces/IAssetTransfer.sol";
import "./CMCCore.sol";
import "./lib/LibAsset.sol";
import "./lib/LibUtils.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract AssetTransfer is CMCCore, IAssetTransfer {
  using SafeMath for uint256;

  mapping(address => uint256) internal totalTransferred;
  mapping(address => mapping(address => uint256)) private emergencyWithdrawableAmount;

  function registerTransfer(address assetId, uint256 amount) internal {
    totalTransferred[assetId] += amount;
  }

  function getTotalTransferred(address assetId) external override view onlyViaProxy nonReentrantView returns (uint256) {
    return totalTransferred[assetId];
  }

  function makeEmergencyWithdrawable(
    address assetId,
    address recipient,
    uint256 amount
  ) internal {
    emergencyWithdrawableAmount[assetId][recipient] += amount;
  }

  function getEmergencyWithdrawableAmount(address assetId, address owner)
    external
    override
    view
    onlyViaProxy
    nonReentrantView
    returns (uint256)
  {
    return emergencyWithdrawableAmount[assetId][owner];
  }

  function getAvailableAmount(address assetId, uint256 maxAmount)
    internal
    returns (uint256)
  {
    return LibUtils.min(maxAmount, LibAsset.getOwnBalance(assetId));
  }

  function transferAsset(address assetId, address payable recipient, uint256 amount)
    internal
  {
    registerTransfer(assetId, amount);
    require(LibAsset.unregisteredTransfer(assetId, recipient, amount), "AssetTransfer: TRANSFER_FAILED");
  }

  function emergencyWithdraw(
    address assetId,
    address owner,
    address payable recipient
  ) external override onlyViaProxy nonReentrant {
    require(msg.sender == owner || owner == recipient, "AssetTransfer: OWNER_MISMATCH");

    uint256 amount = getAvailableAmount(assetId, emergencyWithdrawableAmount[assetId][owner]);

    // Revert if amount is 0
    require(amount > 0, "AssetTransfer: NO_OP");

    emergencyWithdrawableAmount[assetId][owner] = emergencyWithdrawableAmount[assetId][owner].sub(amount);
    transferAsset(assetId, recipient, amount);
  }
}
