// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.7.1;
pragma experimental ABIEncoderV2;

import "./interfaces/ICMCAccountant.sol";
import "./interfaces/Types.sol";
import "./AssetTransfer.sol";
import "./CMCDeposit.sol";
import "./CMCWithdraw.sol";


contract CMCAccountant is
    AssetTransfer,
    CMCDeposit,
    CMCWithdraw,
    ICMCAccountant
{

    function transferBalance(address assetId, Balance memory balance)
        internal
    {
        address payable recipient;
        uint256 amount;

        recipient = balance.to[0];
        amount = balance.amount[0];
        if (amount != 0) {
            transferAsset(assetId, recipient, amount);
        }

        recipient = balance.to[1];
        amount = balance.amount[1];
        if (amount != 0) {
            transferAsset(assetId, recipient, amount);
        }
    }

}
