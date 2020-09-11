// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.7.1;
pragma experimental "ABIEncoderV2";

import "../interfaces/TransferDefinition.sol";
import "../interfaces/Types.sol";

/// @title Linked Transfer
/// @notice This contract allows users to claim a payment locked in
///         the application if they provide the correct preImage

contract LinkedTransfer is TransferDefinition {

    struct TransferState {
        Balance balance;
        bytes32 linkedHash;
    }

    struct TransferResolver {
        bytes32 preImage;
    }

    function create(bytes calldata encodedState)
        override
        external
        view
        returns (bool)
    {
        TransferState memory state = abi.decode(encodedState, (TransferState));

        require(state.balance.amount[1] == 0, "Cannot create linked transfer with nonzero recipient balance");
        require(state.linkedHash != bytes32(0), "Cannot create linked transfer with empty linkedHash");
        return true;
    }

    function resolve(bytes calldata encodedState, bytes calldata encodedResolver)
        override
        external
        view
        returns (Balance memory)
    {
        TransferState memory state = abi.decode(encodedState, (TransferState));
        TransferResolver memory resolver = abi.decode(encodedResolver, (TransferResolver));

        // If you pass in bytes32(0), then it cancels the payment
        if (resolver.preImage != bytes32(0)) {
            // Check hash for normal payment unlock
            bytes32 generatedHash = sha256(abi.encode(resolver.preImage));
            require(
            state.linkedHash == generatedHash,
            "Hash generated from preimage does not match hash in state"
            );

            // Update state
            state.balance.amount[1] = state.balance.amount[0];
            state.balance.amount[0] = 0;
        }

        return state.balance;
    }
}
