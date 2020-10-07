// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.7.1;
pragma experimental ABIEncoderV2;

import "./interfaces/ITransferRegistry.sol";
import "./interfaces/Types.sol";
import "./lib/LibIterableMapping.sol";


contract TransferRegistry is ITransferRegistry {

  using LibIterableMapping for LibIterableMapping.IterableMapping;

  address immutable owner;

  LibIterableMapping.IterableMapping transfers;

  constructor() {
    owner = msg.sender;
  }

  modifier onlyOwner() {
    require(msg.sender == owner, "Only owner can call function");
    _;
  }

  // Should add a transfer definition to the registry
  // onlyOwner
  function addTransferDefinition(RegisteredTransfer memory definition) external override onlyOwner {
    transfers.addTransferDefinition(definition);
  }

  // Should remove a transfer definition from the registry
  // onlyOwner
  function removeTransferDefinition(string memory name) external override onlyOwner {
    transfers.removeTransferDefinition(name);
  }

  // Should return all transfer defintions in registry
  function getTransferDefinitions() external override view returns (RegisteredTransfer[] memory) {
    return transfers.getTransferDefinitions();
  }

}
