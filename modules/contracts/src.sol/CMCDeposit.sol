// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.7.1;
pragma experimental ABIEncoderV2;

import "./interfaces/ICMCDeposit.sol";
import "./CMCCore.sol";
import "./AssetTransfer.sol";
import "./lib/LibAsset.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract CMCDeposit is CMCCore, AssetTransfer, ICMCDeposit {
  mapping(address => uint256) private depositsAlice;

  receive() external payable onlyOnProxy {}

  function getTotalDepositsAlice(address assetId) public override view returns (uint256) {
    return depositsAlice[assetId];
  }

  // Calculated using invariant onchain properties. Note we DONT use safemath here
  function getTotalDepositsBob(address assetId) public override view returns (uint256) {
    return LibAsset.getOwnBalance(assetId) + getTotalTransferred(assetId) - depositsAlice[assetId];
  }

  function depositAlice(address assetId, uint256 amount) external override payable onlyOnProxy {
    if (LibAsset.isEther(assetId)) {
      require(msg.value == amount, "CMCDeposit: msg.value does not match the provided amount");
    } else {
      require(IERC20(assetId).transferFrom(msg.sender, address(this), amount), "CMCDeposit: ERC20 transferFrom failed");
    }
    // NOTE: explicitly do NOT use safemath here
    depositsAlice[assetId] += amount;
  }
}
