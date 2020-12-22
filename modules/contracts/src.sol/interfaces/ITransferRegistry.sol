// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.7.1;
pragma experimental "ABIEncoderV2";

struct RegisteredTransfer {
    string name;
    address definition;
    string stateEncoding;
    string resolverEncoding;
    bytes encodedCancel;
}

interface ITransferRegistry {
    event TransferAdded(RegisteredTransfer transfer);

    event TransferRemoved(RegisteredTransfer transfer);

    // Should add a transfer definition to the registry
    // onlyOwner
    function addTransferDefinition(RegisteredTransfer memory transfer) external;

    // Should remove a transfer definition to the registry
    // onlyOwner
    function removeTransferDefinition(string memory name) external;

    // Should return all transfer defintions in registry
    function getTransferDefinitions()
        external
        view
        returns (RegisteredTransfer[] memory);
}
