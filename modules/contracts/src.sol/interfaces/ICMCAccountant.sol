// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.7.1;
pragma experimental ABIEncoderV2;

import "./ICMCDeposit.sol";
import "./ICMCWithdraw.sol";


interface ICMCAccountant is
    ICMCDeposit,
    ICMCWithdraw
    {}
