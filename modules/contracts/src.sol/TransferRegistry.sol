// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.7.1;
pragma experimental "ABIEncoderV2";

import "./interfaces/ITransferRegistry.sol";
import "./interfaces/Types.sol";

contract TransferRegistry is ITransferRegistry {

  address owner;

  RegisteredTransfer[] transfers;

  constructor() {
    owner = msg.sender;
  }

  modifier onlyOwner() {
    require(msg.sender == owner, "Only owner can call function");
    _;
  }

  // Should add a transfer definition to the registry
  // onlyOwner
  function addTransferDefinition(RegisteredTransfer memory definition) external override onlyOwner returns (bool) {
    // TODO: should make sure the definition is not already included
    transfers.push(definition);
    return true;
  }

  // Should remove a transfer definition to the registry
  // onlyOwner
  function removeTransferDefinition(RegisteredTransfer memory definition) external override onlyOwner returns (bool) {
    // TODO: should make sure the definition is included
    // TODO: should remove transfer
    return false;
  }

  // Should return all transfer defintions in registry
  function getTransferDefinitions() external override view returns (RegisteredTransfer[] memory transfers) {
    return transfers;
  }
}
