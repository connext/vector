// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.7.1;
pragma experimental "ABIEncoderV2";

import "./Types.sol";

interface ITransferRegistry {
  // Should add a transfer definition to the registry
  // onlyOwner
  function addTransferDefinition(RegisteredTransfer memory transfer) external;

  // Should remove a transfer definition to the registry
  // onlyOwner
  function removeTransferDefinition(string memory name) external;

  // Should return all transfer defintions in registry
  function getTransferDefinitions() external view returns (RegisteredTransfer[] memory);
}
