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

    function makeBalanceEmergencyWithdrawable(address assetId, Balance memory balance)
        internal
    {
        for (uint256 i = 0; i < 2; i++) {
            uint256 amount = balance.amount[i];
            if (amount > 0) {
                makeEmergencyWithdrawable(assetId, balance.to[i], amount);
            }
        }
    }

}
