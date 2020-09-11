// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.7.1;
pragma experimental "ABIEncoderV2";

import "../interfaces/TransferDefinition.sol";
import "../interfaces/Types.sol";
import "../shared/LibChannelCrypto.sol";

/// @title Withdraw
/// @notice This contract burns the initiator's funds if a mutually signed
///         withdraw commitment can be generated

contract Withdraw is TransferDefinition {

    struct TransferState {
        Balance balance;
        bytes initiatorSignature;
        address[2] signers; // must be multisig participants with withdrawer at [0]
        bytes32 data;
        bytes32 nonce; // included so that each withdraw commitment has a unique hash
        uint256 fee;
    }

    struct TransferResolver {
        bytes32 responderSignature;
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

        require(state.signers[0] == state.data.verifyChannelMessage(state.signatures[0]), "invalid withdrawer signature");

        // Allow for a withdrawal to be canceled by passing in an empty resolver signature
        if(resolver.signature != bytes(0)) {
            require(state.signers[1] == state.data.verifyChannelMessage(resolver.signature), "invalid counterparty signature");

            // Reduce withdraw amount by optional fee -- note that it's up to the offchain validators to ensure
            // That the withdraw commitment takes this fee into account
            state.balance.amount[1] == state.fee;
            state.balance.amount[0] == 0;
        };

        return state.balance;
    }
}
