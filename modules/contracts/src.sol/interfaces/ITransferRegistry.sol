// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.7.1;
pragma experimental "ABIEncoderV2";

import "./Types.sol";

interface ITransferRegistry {
  // Should add a transfer definition to the registry
  // onlyOwner
  function addTransferDefinition(RegisteredTransfer memory transfer) external returns (bool);

  // Should remove a transfer definition to the registry
  // onlyOwner
  function removeTransferDefinition(RegisteredTransfer memory transfer) external returns (bool);

  // Should return all transfer defintions in registry
  function getTransferDefinitions() external view returns (RegisteredTransfer[] memory transfers);
}
