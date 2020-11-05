// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.7.1;
pragma experimental ABIEncoderV2;

import "./interfaces/ICMCDeposit.sol";
import "./CMCCore.sol";
import "./AssetTransfer.sol";
import "./lib/LibAsset.sol";
import "./lib/LibERC20.sol";

contract CMCDeposit is CMCCore, AssetTransfer, ICMCDeposit {
  mapping(address => uint256) private depositsAlice;

  receive() external payable onlyViaProxy nonReentrant {}

  function getTotalDepositsAlice(address assetId) external override view onlyViaProxy nonReentrantView returns (uint256) {
    return _getTotalDepositsAlice(assetId);
  }

  function _getTotalDepositsAlice(address assetId) internal view returns (uint256) {
    return depositsAlice[assetId];
  }

  function getTotalDepositsBob(address assetId) external override view onlyViaProxy nonReentrantView returns (uint256) {
    return _getTotalDepositsBob(assetId);
  }

  // Calculated using invariant onchain properties. Note we DONT use safemath here
  function _getTotalDepositsBob(address assetId) internal view returns (uint256) {
    return LibAsset.getOwnBalance(assetId) + totalTransferred[assetId] - depositsAlice[assetId];
  }

  function depositAlice(address assetId, uint256 amount) external override payable onlyViaProxy nonReentrant {
    if (LibAsset.isEther(assetId)) {
      require(
        msg.value == amount,
        "CMCDeposit: msg.value does not match the provided amount");
    } else {
      require(
        LibERC20.transferFrom(assetId, msg.sender, address(this), amount),
        "CMCDeposit: ERC20 transferFrom failed"
      );
    }
    // NOTE: explicitly do NOT use safemath here
    depositsAlice[assetId] += amount;
  }
}
