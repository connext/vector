// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.7.1;
pragma experimental ABIEncoderV2;

import "../interfaces/ITransferRegistry.sol";

library LibIterableMapping {
  struct TransferDefinitionWithIndex {
    RegisteredTransfer transfer;
    uint256 index;
  }

  struct IterableMapping {
    mapping(string => TransferDefinitionWithIndex) transfers;
    string[] names;
  }

  function stringEqual(string memory s, string memory t) internal pure returns (bool) {
    return keccak256(abi.encodePacked(s)) == keccak256(abi.encodePacked(t));
  }

  function isEmptyString(string memory s) internal pure returns (bool) {
    return stringEqual(s, "");
  }

  function nameExists(IterableMapping storage self, string memory name) internal view returns (bool) {
    return !isEmptyString(name) && self.names.length != 0 && stringEqual(self.names[self.transfers[name].index], name);
  }

  function length(IterableMapping storage self) internal view returns (uint256) {
    return self.names.length;
  }

  function getTransferDefinitionByName(IterableMapping storage self, string memory name)
    internal
    view
    returns (RegisteredTransfer memory)
  {
    require(!isEmptyString(name), "LibIterableMapping: empty name");
    require(nameExists(self, name), "LibIterableMapping: name not found");
    return self.transfers[name].transfer;
  }

  function getTransferDefinitionByIndex(IterableMapping storage self, uint256 index)
    internal
    view
    returns (RegisteredTransfer memory)
  {
    require(index < self.names.length, "LibIterableMapping: invalid index");
    return self.transfers[self.names[index]].transfer;
  }

  function getTransferDefinitions(IterableMapping storage self) internal view returns (RegisteredTransfer[] memory) {
    uint256 l = self.names.length;
    RegisteredTransfer[] memory transfers = new RegisteredTransfer[](l);
    for (uint256 i = 0; i < l; i++) {
      transfers[i] = self.transfers[self.names[i]].transfer;
    }
    return transfers;
  }

  function addTransferDefinition(IterableMapping storage self, RegisteredTransfer memory transfer) internal {
    string memory name = transfer.name;
    require(!isEmptyString(name), "LibIterableMapping: empty name");
    require(!nameExists(self, name), "LibIterableMapping: name not found");
    self.transfers[name] = TransferDefinitionWithIndex({transfer: transfer, index: self.names.length});
    self.names.push(name);
  }

  function removeTransferDefinition(IterableMapping storage self, string memory name) internal {
    require(!isEmptyString(name), "LibIterableMapping: empty name");
    require(nameExists(self, name), "LibIterableMapping: name not found");
    uint256 index = self.transfers[name].index;
    string memory lastName = self.names[self.names.length - 1];
    self.transfers[lastName].index = index;
    self.names[index] = lastName;
    delete self.transfers[name];
    self.names.pop();
  }
}
