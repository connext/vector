// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.7.1;
pragma experimental ABIEncoderV2;

import "./interfaces/ITransferRegistry.sol";
import "./lib/LibIterableMapping.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/// @title TransferRegistry
/// @author Layne Haber <layne@connext.network>
/// @notice The TransferRegistry maintains an onchain record of all
///         supported transfers (specifically holds the registry information
///         defined within the contracts). The offchain protocol uses
///         this information to get the correct encodings when generating
///         signatures. The information stored here can only be updated
///         by the owner of the contract
contract TransferRegistry is Ownable, ITransferRegistry {
  using LibIterableMapping for LibIterableMapping.IterableMapping;

  LibIterableMapping.IterableMapping transfers;

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
  function getTransferDefinitions() external view override returns (RegisteredTransfer[] memory) {
    return transfers.getTransferDefinitions();
  }
}
