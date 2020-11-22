// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.7.1;
pragma experimental "ABIEncoderV2";

import "../ChannelMastercopy.sol";
import "../interfaces/ITestChannel.sol";

/// @title TestChannel
/// @author Layne Haber <layne@connext.network>
/// @notice This contract will help test the `ChannelMastercopy` contract and
///         the associated bits of functionality. This contract should *only*
///         contain aliases to internal functions that should be unit-tested,
///         like the `makeEmergencyWithdrawable` call on `CMCAsset.sol`. Using this
///         contract will help reduce the amount of boilerplate needed to test
///         component functionality. For example, `CMCAsset.sol` is only
///         able to be tested via the adjudicator in many practical cases.
///         Creating a helper function allows for easier testing of only
///         that functionality.

contract TestChannel is ChannelMastercopy, ITestChannel {
  function testMakeEmergencyWithdrawable(
    address assetId,
    address payable recipient,
    uint256 maxAmount
  ) public override {
    makeEmergencyWithdrawable(assetId, recipient, maxAmount);
  }

  function testMakeBalanceEmergencyWithdrawable(
    address assetId,
    Balance memory balance
  ) public override {
    makeBalanceEmergencyWithdrawable(assetId, balance);
  }
}
