// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.7.1;
pragma experimental ABIEncoderV2;

import "./interfaces/IVectorChannel.sol";
import "./CMCCore.sol";
import "./CMCAsset.sol";
import "./CMCDeposit.sol";
import "./CMCWithdraw.sol";
import "./CMCAdjudicator.sol";

/// @title ChannelMastercopy
/// @author Connext <support@connext.network>
/// @notice Contains the logic used by all Vector multisigs. A proxy to this
///         contract is deployed per-channel using the ChannelFactory.sol.
///         Supports channel adjudication logic, deposit logic, and arbitrary
///         calls when a commitment is double-signed.
contract ChannelMastercopy is
    CMCCore,
    CMCAsset,
    CMCDeposit,
    CMCWithdraw,
    CMCAdjudicator,
    IVectorChannel
{

}
