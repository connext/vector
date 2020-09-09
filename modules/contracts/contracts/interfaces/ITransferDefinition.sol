// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.7.1;
pragma experimental "ABIEncoderV2";


interface ITransferDefinition {

    // Validates the initial state of the transfer.
    // Called by validator.ts during `create` updates.
    function initialize(bytes calldata)
        external
        view
        returns (bool);

    // Performs a state transition to resolve a transfer
    // and returns final balances. Called by validator.ts
    // during `resolve` updates.
    function resolve(bytes calldata, bytes calldata)
        external
        view
        returns (bytes memory);

}
