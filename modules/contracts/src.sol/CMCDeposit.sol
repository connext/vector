// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.7.1;
pragma experimental ABIEncoderV2;

import "./interfaces/ICMCDeposit.sol";
import "./CMCCore.sol";
import "./CMCAsset.sol";
import "./lib/LibAsset.sol";
import "./lib/LibERC20.sol";

/// @title CMCDeposit
/// @author Connext <support@connext.network>
/// @notice Contains logic supporting channel multisig deposits. Channel
///         funding is asymmetric, with `alice` having to call a deposit
///         function which tracks the total amount she has deposited so far,
///         and any other funds in the multisig being attributed to `bob`.

contract CMCDeposit is CMCCore, CMCAsset, ICMCDeposit {
    mapping(address => uint256) private depositsAlice;

    receive() external payable onlyViaProxy nonReentrant {}

    function getTotalDepositsAlice(address assetId)
        external
        view
        override
        onlyViaProxy
        nonReentrantView
        returns (uint256)
    {
        return _getTotalDepositsAlice(assetId);
    }

    function _getTotalDepositsAlice(address assetId)
        internal
        view
        returns (uint256)
    {
        return depositsAlice[assetId];
    }

    function getTotalDepositsBob(address assetId)
        external
        view
        override
        onlyViaProxy
        nonReentrantView
        returns (uint256)
    {
        return _getTotalDepositsBob(assetId);
    }

    // Calculated using invariant onchain properties. Note we DONT use safemath here
    function _getTotalDepositsBob(address assetId)
        internal
        view
        returns (uint256)
    {
        return
            LibAsset.getOwnBalance(assetId) +
            totalTransferred[assetId] -
            depositsAlice[assetId];
    }

    function depositAlice(address assetId, uint256 amount)
        external
        payable
        override
        onlyViaProxy
        nonReentrant
    {
        if (LibAsset.isEther(assetId)) {
            require(msg.value == amount, "CMCDeposit: VALUE_MISMATCH");
        } else {
            require(
                LibERC20.transferFrom(
                    assetId,
                    msg.sender,
                    address(this),
                    amount
                ),
                "CMCDeposit: ERC20_TRANSFER_FAILED"
            );
        }
        // NOTE: explicitly do NOT use safemath here
        depositsAlice[assetId] += amount;
        emit AliceDeposited(assetId, amount);
    }
}
