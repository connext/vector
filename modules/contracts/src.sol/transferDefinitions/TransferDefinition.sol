// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.7.1;
pragma experimental ABIEncoderV2;

import "../interfaces/ITransferDefinition.sol";
import "../interfaces/ITransferRegistry.sol";

/// @title TransferDefinition
/// @author Connext <support@connext.network>
/// @notice This contract helps reduce boilerplate needed when creating
///         new transfer definitions by providing an implementation of
///         the required getter

abstract contract TransferDefinition is ITransferDefinition {
    function getRegistryInformation()
        external
        view
        override
        returns (RegisteredTransfer memory)
    {
        return
            RegisteredTransfer({
                name: this.Name(),
                stateEncoding: this.StateEncoding(),
                resolverEncoding: this.ResolverEncoding(),
                definition: address(this)
            });
    }
}
