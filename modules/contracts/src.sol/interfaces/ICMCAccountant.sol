// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.7.1;
pragma experimental ABIEncoderV2;

import "./IAssetTransfer.sol";
import "./ICMCDeposit.sol";
import "./ICMCWithdraw.sol";

interface ICMCAccountant is IAssetTransfer, ICMCDeposit, ICMCWithdraw {}
