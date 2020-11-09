// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.7.1;
pragma experimental ABIEncoderV2;

import "./interfaces/IAssetTransfer.sol";
import "./CMCCore.sol";
import "./lib/LibAsset.sol";
import "./lib/LibERC20.sol";
import "./lib/LibUtils.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract AssetTransfer is CMCCore, IAssetTransfer {
  using SafeMath for uint256;

  // TODO: These are ad hoc values. Confirm or find more suitable ones.
  uint256 private constant ETHER_TRANSFER_GAS_LIMIT = 10000;
  uint256 private constant ERC20_TRANSFER_GAS_LIMIT = 100000;
  uint256 private constant ERC20_BALANCEOF_GAS_LIMIT = 10000;

  mapping(address => uint256) internal totalTransferred;
  mapping(address => mapping(address => uint256)) private emergencyWithdrawableAmount;

  modifier onlySelf() {
    require(msg.sender == address(this), "AssetTransfer: Can only be called from this contract");
    _;
  }

  function safelyTransferEther(address payable recipient, uint256 maxAmount) private returns (bool, uint256) {
    uint256 balance = address(this).balance;
    uint256 amount = LibUtils.min(maxAmount, balance);
    (bool success, ) = recipient.call{gas: ETHER_TRANSFER_GAS_LIMIT, value: amount}("");
    return (success, success ? amount : 0);
  }

  function safelyTransferERC20(
    address assetId,
    address recipient,
    uint256 maxAmount
  ) private returns (bool, uint256) {
    (bool success, bytes memory encodedReturnValue) = address(this).staticcall(
      abi.encodeWithSignature("_getOwnERC20Balance(address)", assetId)
    );
    if (!success) {
      return (false, 0);
    }

    uint256 balance = abi.decode(encodedReturnValue, (uint256));
    uint256 amount = LibUtils.min(maxAmount, balance);
    (success, ) = address(this).call(
      abi.encodeWithSignature("_transferERC20(address,address,uint256)", assetId, recipient, amount)
    );

    return (success, success ? amount : 0);
  }

  function safelyTransfer(
    address assetId,
    address payable recipient,
    uint256 maxAmount
  ) private returns (bool, uint256) {
    return
      LibAsset.isEther(assetId)
        ? safelyTransferEther(recipient, maxAmount)
        : safelyTransferERC20(assetId, recipient, maxAmount);
  }

  function _getOwnERC20Balance(address assetId) external view onlySelf returns (uint256) {
    return IERC20(assetId).balanceOf{gas: ERC20_BALANCEOF_GAS_LIMIT}(address(this));
  }

  function _transferERC20(
    address assetId,
    address recipient,
    uint256 amount
  ) external onlySelf {
    require(
      LibERC20.transfer(assetId, recipient, amount, ERC20_TRANSFER_GAS_LIMIT)
    );
  }

  function registerTransfer(address assetId, uint256 amount) internal {
    totalTransferred[assetId] += amount;
  }

  function addToEmergencyWithdrawableAmount(
    address assetId,
    address owner,
    uint256 amount
  ) internal {
    emergencyWithdrawableAmount[assetId][owner] += amount;
  }

  function transferAsset(
    address assetId,
    address payable recipient,
    uint256 maxAmount
  ) internal returns (bool) {
    (bool success, uint256 amount) = safelyTransfer(assetId, recipient, maxAmount);

    if (success) {
      registerTransfer(assetId, amount);
    } else {
      addToEmergencyWithdrawableAmount(assetId, recipient, maxAmount);
    }

    return success;
  }

  function getTotalTransferred(address assetId) external override view onlyViaProxy nonReentrantView returns (uint256) {
    return totalTransferred[assetId];
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

  function emergencyWithdraw(
    address assetId,
    address owner,
    address payable recipient
  ) external override onlyViaProxy nonReentrant {
    require(
      msg.sender == owner || owner == recipient,
      "AssetTransfer: Either msg.sender or recipient of funds must be the owner of an emergency withdraw"
    );

    uint256 maxAmount = emergencyWithdrawableAmount[assetId][owner];
    uint256 balance = LibAsset.getOwnBalance(assetId);
    uint256 amount = LibUtils.min(maxAmount, balance);

    // TODO: Should we revert if amount is 0?

    emergencyWithdrawableAmount[assetId][owner] = emergencyWithdrawableAmount[assetId][owner].sub(amount);
    registerTransfer(assetId, amount);
    require(LibAsset.transfer(assetId, recipient, amount), "AssetTransfer: Transfer failed");
  }

}
