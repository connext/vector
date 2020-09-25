// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.7.1;
pragma experimental ABIEncoderV2;

import "./ICMCCore.sol";
import "./ICMCWithdraw.sol";
import "./ICMCDeposit.sol";
import "./ICMCAdjudicator.sol";


interface IVectorChannel is
    ICMCCore,
    ICMCWithdraw,
    ICMCDeposit,
    ICMCAdjudicator
    {}
