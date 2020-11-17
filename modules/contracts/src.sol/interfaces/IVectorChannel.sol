// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.7.1;
pragma experimental ABIEncoderV2;

import "./ICMCCore.sol";
import "./ICMCAccountant.sol";
import "./ICMCAdjudicator.sol";


interface IVectorChannel is
    ICMCCore,
    ICMCAccountant,
    ICMCAdjudicator {}
