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

    mapping(address => LatestDeposit) internal _latestDeposit;

    receive() external payable onlyOnProxy {}

    function getLatestDeposit(
        address assetId
    )
        public
        override
        view
        onlyOnProxy
        returns (LatestDeposit memory)
    {
        return _latestDeposit[assetId];
    }

    function initiatorDeposit(
        address assetId,
        uint256 amount
    )
        public
        payable
        override
        onlyOnProxy
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
        _latestDeposit[assetId].amount = amount;
        _latestDeposit[assetId].nonce++;
    }

}
