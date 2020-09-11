// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.7.1;
pragma experimental "ABIEncoderV2";

import "./Types.sol";
import "./ITransferDefinition.sol";

contract TransferDefinition is ITransferDefinition {

    // Validates the initial state of the transfer.
    // Called by validator.ts during `create` updates.
    function create(bytes calldata)
        override
        virtual
        external
        view
        returns (bool)
    {
        revert("The create method has no implementation for this TransferDefinition");
    }

    // Performs a state transition to resolve a transfer
    // and returns final balances. Called by validator.ts
    // during `resolve` updates.
    function resolve(bytes calldata, bytes calldata)
        override
        virtual
        external
        view
        returns (Balance memory)
    {
        revert("The resolve method has no implementation for this TransferDefinition");
    }

}
