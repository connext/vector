// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.7.1;
pragma experimental ABIEncoderV2;

import "./ICMCAsset.sol";
import "./ICMCDeposit.sol";
import "./ICMCWithdraw.sol";

interface ICMCAccountant is ICMCAsset, ICMCDeposit, ICMCWithdraw {}
