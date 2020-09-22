// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.7.1;
pragma experimental ABIEncoderV2;

import "./ICMCCore.sol";
import "./ICMCExecutor.sol";
import "./ICMCDeposit.sol";
import "./ICMCAdjudicator.sol";


interface IVectorChannel is
    ICMCCore,
    ICMCExecutor,
    ICMCDeposit,
    ICMCAdjudicator
    {}
