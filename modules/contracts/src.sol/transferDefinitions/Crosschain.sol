// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.7.1;
pragma experimental ABIEncoderV2;

import "./TransferDefinition.sol";
import "../lib/LibChannelCrypto.sol";

/// @title Crosschain
/// @author Connext <support@connext.network>
/// @notice This contract burns the initiator's funds if a mutually signed
///         transfer can be generated

contract Crosschain is TransferDefinition {
    using LibChannelCrypto for bytes32;

    struct TransferState {
        bytes32 lockHash;
        uint256 expiry; // If 0, then no timelock is enforced.
    }

    struct TransferState {
        bytes initiatorSignature;
        address initiator;
        address responder;
        bytes32 data;
        uint256 nonce; // Included so that each transfer commitment has a unique hash.
        uint256 fee;
        address callTo;
        bytes callData;
    }

    struct TransferResolver {
        bytes responderSignature;
        bytes32 preImage;
    }

    // Provide registry information.
    string public constant override Name = "CrosschainTransfer";
    string public constant override StateEncoding =
        "tuple(bytes initiatorSignature, address initiator, address responder, bytes32 data, uint256 nonce, uint256 fee, address callTo, bytes callData)";
    string public constant override ResolverEncoding =
        "tuple(bytes responderSignature)";

    function EncodedCancel() external pure override returns(bytes memory) {
      TransferResolver memory resolver;
      resolver.responderSignature = new bytes(65);
      return abi.encode(resolver);
    }

    function create(bytes calldata encodedBalance, bytes calldata encodedState)
        external
        pure
        override
        returns (bool)
    {
        // Get unencoded information.
        TransferState memory state = abi.decode(encodedState, (TransferState));
        Balance memory balance = abi.decode(encodedBalance, (Balance));

        // Ensure data and nonce provided.
        require(state.data != bytes32(0), "CrosschainTransfer: EMPTY_DATA");
        require(state.nonce != uint256(0), "CrosschainTransfer: EMPTY_NONCE");

        // Initiator balance must be greater than 0 and include amount for fee.
        require(
            balance.amount[0] > 0,
            "CrosschainTransfer: ZER0_SENDER_BALANCE"
        );
        require(
            state.fee <= balance.amount[0],
            "CrosschainTransfer: INSUFFICIENT_BALANCE"
        );

        // Recipient balance must be 0.
        require(
            balance.amount[1] == 0,
            "CrosschainTransfer: NONZERO_RECIPIENT_BALANCE"
        );

        // Valid lockHash to secure funds must be provided.
        require(
            state.lockHash != bytes32(0),
            "CrosschainTransfer: EMPTY_LOCKHASH"
        );

        // Ensure that the timelock, if applicable, has not expired.
        require(
            state.expiry == 0 || state.expiry > block.timestamp,
            "CrosschainTransfer: EXPIRED_TIMELOCK"
        );

        // Update state.
        balance.amount[1] = balance.amount[0];
        balance.amount[0] = 0;
        
        // Valid initial transfer state
        return true;
    }

    function resolve(
        bytes calldata encodedBalance,
        bytes calldata encodedState,
        bytes calldata encodedResolver
    ) external pure override returns (Balance memory) {
        TransferState memory state = abi.decode(encodedState, (TransferState));
        TransferResolver memory resolver =
            abi.decode(encodedResolver, (TransferResolver));
        Balance memory balance = abi.decode(encodedBalance, (Balance));

        // Ensure data and nonce provided.
        require(state.data != bytes32(0), "CrosschainTransfer: EMPTY_DATA");
        require(state.nonce != uint256(0), "CrosschainTransfer: EMPTY_NONCE");

        // Amount recipient is able to withdraw > 0.
        require(
            balance.amount[1] == 0,
            "CrosschainTransfer: NONZERO_RECIPIENT_BALANCE"
        );

        // Transfer expiry cannot be expired.
        require(
            state.expiry == 0 || state.expiry > block.timestamp,
            "CrosschainTransfer: EXPIRED_TIMELOCK"
        );

        // Transfer must be signed by both parties to resolve.
        require(
            state.initiator != address(0) && state.responder != address(0),
            "CrosschainTransfer: EMPTY_SIGNERS"
        );

        // Payment must not be expired based on defined expiry, if applicable.
        require(
            state.expiry == 0 || state.expiry > block.timestamp,
            "CrosschainTransfer: PAYMENT_EXPIRED"
        );

        // Initiator signature must be valid.
        require(
            state.data.checkSignature(
                state.initiatorSignature,
                state.initiator
            ),
            "CrosschainTransfer: INVALID_INITIATOR_SIG"
        );

        require(
            state.data.checkSignature(
                resolver.responderSignature,
                state.responder
            ),
            "CrosschainTransfer: INVALID_RESPONDER_SIG"
        );

        // Check hash for normal payment unlock.
        bytes32 generatedHash = sha256(abi.encode(resolver.preImage));
        require(
            state.lockHash == generatedHash,
            "CrosschainTransfer: INVALID_PREIMAGE"
        );

        // Reduce CrosschainTransfer amount by optional fee.
        // It's up to the offchain validators to ensure that the
        // CrosschainTransfer commitment takes this fee into account.
        balance.amount[1] = state.fee;
        balance.amount[0] = 0;

        return balance;

        // TODO: Remove. No canceling
        // To cancel, the preImage must be empty (not simply incorrect)
        // There are no additional state mutations, and the preImage is
        // asserted by the `if` statement

        // Allow for a withdrawal to be canceled if an empty signature is 
        // passed in. Should have *specific* cancellation action, not just
        // any invalid sig
        // bytes memory b = new bytes(65);
        // if (keccak256(resolver.responderSignature) == keccak256(b)) {
        //     // CrosschainTransfer should be cancelled, no state manipulation needed
        // } else {
            
        // }
    }
}
