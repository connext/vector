// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.7.1;
pragma experimental ABIEncoderV2;

import "./interfaces/ICMCDeposit.sol";
import "./interfaces/Types.sol";
import "./interfaces/IERC20.sol";
import "./CMCCore.sol";


/// @title Vector Channel
/// @author Arjun Bhuptani <arjun@connext.network>
/// @notice
/// (a) A proxy to this contract is deployed per-channel using the ChannelFactory.sol contract
/// (b) Executes transactions dispute logic on a hardcoded channel factory
/// (c) Supports executing arbitrary CALLs when called w/ commitment that has 2 signatures

contract CMCDeposit is CMCCore, ICMCDeposit {

    mapping(address => uint256) internal _totalDepositedA;

    receive() external payable onlyOnProxy {}

    function getBalance(address assetId) public override view returns (uint256) {
        return assetId == address(0)
            ? address(this).balance
            : IERC20(assetId).balanceOf(address(this));
    }

    function totalDepositedA(address assetId) public override view returns (uint256) {
        return _totalDepositedA[assetId];
    }

    // Calculated using invariant onchain properties. Note we DONT use safemath here
    function totalDepositedB(address assetId) public override view returns (uint256) {
        return getBalance(assetId) + _totalWithdrawn[assetId] - _totalDepositedA[assetId];
    }

    function depositA(
        address assetId,
        uint256 amount
    )
        public
        override
        payable
    {
        if (assetId == address(0)) {
            require(
                msg.value == amount,
                "msg.value does not match the provided amount"
            );
        } else {
            require(
                IERC20(assetId).transferFrom(msg.sender, address(this), amount),
                "ERC20: transferFrom failed"
            );
        }
        // NOTE: explicitly do NOT use safemath here
        _totalDepositedA[assetId] += amount;
    }

}
