// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.7.1;
pragma experimental ABIEncoderV2;

import "./interfaces/ICMCWithdraw.sol";
import "./interfaces/IChannelFactory.sol";

struct BatchWithdrawData {
    WithdrawData withdrawData;
    address alice;
    address bob;
    bytes aliceSignature,
    bytes bobSignature
}

/// @title BatchSubmitter
/// @author Connext <support@connext.network>
/// @notice 
contract BatchSubmitter {
    IChannelFactory private immutable channelFactory;

    constructor(address channelFactoryAddress) {
        channelFactory = IChannelFactory(channelFactoryAddress);
    }

    function submitBatchWithdrawals(BatchWithdrawData[] calldata withdrawals)
        external
        returns (bool)
    {
        for (uint i = 0; i < withdrawals.length; i++) {
            BatchWithdrawData calldata withdrawal = withdrawals[i];
            address channelAddress = withdrawal.withdrawData.channelAddress;
            ICMCWithdraw channel = ICMCWithdraw(withdrawal.withdrawData.channelAddress);

            // check if contract is deployed
            uint32 size;
            assembly {
                size := extcodesize(channelAddress)
            }

            // needs to be deployed
            if (size == 0) {
                channelFactory.createChannelAndDepositAlice(
                    withdrawal.alice, 
                    withdrawal.bob, 
                    withdrawal.withdrawData.assetId, 
                    withdrawal.withdrawData.amount
                );
            }

            channel.withdraw(withdrawal.withdrawData, withdrawal.aliceSignature, withdrawal.bobSignature);
        }
        return true;
    }
}