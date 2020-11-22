// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.7.1;
pragma experimental ABIEncoderV2;

import "./ICMCCore.sol";
import "./ICMCAsset.sol";
import "./ICMCDeposit.sol";
import "./ICMCWithdraw.sol";
import "./ICMCAdjudicator.sol";


interface IVectorChannel is
    ICMCCore,
    ICMCAsset,
    ICMCDeposit,
    ICMCWithdraw,
    ICMCAdjudicator
    {}
