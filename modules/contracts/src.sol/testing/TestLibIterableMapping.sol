// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.7.1;
pragma experimental ABIEncoderV2;

import "../interfaces/ITransferRegistry.sol";
import "../lib/LibIterableMapping.sol";

/// @title TestLibIterableMapping
/// @author Layne Haber <layne@connext.network>
/// @notice Used to easily test the internal methods of
///         LibIterableMapping.sol by aliasing them to public
///         methods.
contract TestLibIterableMapping {
  using LibIterableMapping for LibIterableMapping.IterableMapping;

  LibIterableMapping.IterableMapping data;

  constructor() {}

  function stringEqual(string memory s, string memory t) public pure returns (bool) {
    return LibIterableMapping.stringEqual(s, t);
  }

  function isEmptyString(string memory s) public pure returns (bool) {
    return LibIterableMapping.isEmptyString(s);
  }

  function nameExists(string memory name) public view returns (bool) {
    return LibIterableMapping.nameExists(data, name);
  }

  function length() public view returns (uint256) {
    return LibIterableMapping.length(data);
  }

  function getTransferDefinitionByName(string memory name) public view returns (RegisteredTransfer memory) {
    return LibIterableMapping.getTransferDefinitionByName(data, name);
  }

  function getTransferDefinitionByIndex(uint256 index) public view returns (RegisteredTransfer memory) {
    return LibIterableMapping.getTransferDefinitionByIndex(data, index);
  }

  function getTransferDefinitions() public view returns (RegisteredTransfer[] memory) {
    return LibIterableMapping.getTransferDefinitions(data);
  }

  function addTransferDefinition(RegisteredTransfer memory transfer) public {
    return LibIterableMapping.addTransferDefinition(data, transfer);
  }

  function removeTransferDefinition(string memory name) public {
    return LibIterableMapping.removeTransferDefinition(data, name);
  }
}
