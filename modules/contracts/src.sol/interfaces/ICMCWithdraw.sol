// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.7.1;
pragma experimental ABIEncoderV2;

import "./Types.sol";

interface ICMCWithdraw {
  function getWithdrawalTransactionRecord(
    WithdrawData calldata wd
  ) external view returns (bool);

  function withdraw(
    WithdrawData calldata wd,
    bytes calldata aliceSignature,
    bytes calldata bobSignature
  ) external;
}
