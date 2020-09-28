// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.7.1;
pragma experimental ABIEncoderV2;

import "../interfaces/IERC20.sol";
import "./LibUtils.sol";


library LibAsset {

    address constant ETHER_ASSETID = address(0);

    // TODO: These are ad hoc values. Confirm or find more suitable ones.
    uint256 constant ETHER_TRANSFER_GAS_LIMIT = 10000;
    uint256 constant ERC20_TRANSFER_GAS_LIMIT = 100000;
    uint256 constant QUERY_BALANCE_GAS_LIMIT = 5000;

    function isEther(address assetId)
        internal
        pure
        returns (bool)
    {
        return assetId == ETHER_ASSETID;
    }

    function getEtherBalance(address who)
        internal
        view
        returns (uint256)
    {
        return who.balance;
    }

    function getERC20Balance(address assetId, address who)
        internal
        view
        returns (uint256)
    {
        return IERC20(assetId).balanceOf(who);
    }

    function getBalance(address assetId, address who)
        internal
        view
        returns (uint256)
    {
        return isEther(assetId) ?
            getEtherBalance(who) :
            getERC20Balance(assetId, who);
    }

    function transferEther(address payable recipient, uint256 amount)
        internal
        returns (bool)
    {
        (bool success, ) = recipient.call{gas: ETHER_TRANSFER_GAS_LIMIT, value: amount}("");
        return success;
    }

    function transferERC20(address assetId, address recipient, uint256 amount)
        internal
        returns (bool)
    {
        (bool success, bytes memory encodedReturnValue) = assetId.call{gas: ERC20_TRANSFER_GAS_LIMIT}(
            abi.encodeWithSignature("transfer(address,uint256)", recipient, amount)
        );
        return success && (encodedReturnValue.length == 0 || abi.decode(encodedReturnValue, (bool)));
    }

    function transfer(address assetId, address payable recipient, uint256 amount)
        internal
        returns (bool)
    {
        return isEther(assetId) ?
            transferEther(recipient, amount) :
            transferERC20(assetId, recipient, amount);
    }

    function transferUpTo(address assetId, address payable recipient, uint256 maxAmount)
        internal
        returns (bool, uint256)
    {
        (bool success, bytes memory encodedReturnValue) = address(this).call{gas: QUERY_BALANCE_GAS_LIMIT}(
            abi.encodeWithSignature("getBalance(address,address)", assetId, recipient)
        );
        if (!success) {
            return (false, 0);
        }
        uint256 balance = abi.decode(encodedReturnValue, (uint256));
        uint256 amount = LibUtils.min(maxAmount, balance);
        success = transfer(assetId, recipient, amount);
        return (success, amount);
    }

}
