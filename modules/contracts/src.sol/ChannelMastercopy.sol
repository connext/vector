// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.7.1;
pragma experimental ABIEncoderV2;

import "./interfaces/IVectorChannel.sol";
import "./CMCCore.sol";
import "./CMCWithdraw.sol";
import "./CMCDeposit.sol";
import "./CMCAdjudicator.sol";

/// @title Vector Channel
/// @author Arjun Bhuptani <arjun@connext.network>
/// @notice
/// (a) A proxy to this contract is deployed per-channel using the ChannelFactory.sol contract
/// (b) Executes transactions dispute logic on a hardcoded channel factory
/// (c) Supports executing arbitrary CALLs when called w/ commitment that has 2 signatures

contract ChannelMastercopy is
    CMCCore,
    CMCWithdraw,
    CMCDeposit,
    CMCAdjudicator,
    IVectorChannel
    {}
