// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.7.1;
pragma experimental ABIEncoderV2;

import "./IVectorChannel.sol";
import "./Types.sol";

interface ITestChannel is IVectorChannel {
  function assetTransfer(
    address assetId,
    address payable recipient,
    uint256 maxAmount
  ) external;

  function accountantBalanceTransfer(
    address assetId,
    Balance memory balance
  ) external;
}
