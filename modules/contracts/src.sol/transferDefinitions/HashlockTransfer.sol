// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.7.1;
pragma experimental ABIEncoderV2;

import "./TransferDefinition.sol";

/// @title Hashlock Transfer
/// @notice This contract allows users to claim a payment locked in
///         the application if they provide the correct preImage. The payment is
///         reverted if not unlocked by the timelock if one is provided.

contract HashlockTransfer is TransferDefinition {
  struct TransferState {
    bytes32 lockHash;
    uint256 expiry; // If 0, then no timelock is enforced
  }

  struct TransferResolver {
    bytes32 preImage;
  }

  string public constant override Name = "HashlockTransfer";
  string public constant override StateEncoding = "tuple(bytes32 lockHash, uint256 expiry)";
  string public constant override ResolverEncoding = "tuple(bytes32 preImage)";

  function create(bytes calldata encodedBalance, bytes calldata encodedState) external override view returns (bool) {
    TransferState memory state = abi.decode(encodedState, (TransferState));
    Balance memory balance = abi.decode(encodedBalance, (Balance));

    require(balance.amount[1] == 0, "HashlockTransfer: NONZERO_RECIPIENT_BALANCE");
    require(state.lockHash != bytes32(0), "HashlockTransfer: EMPTY_LOCKHASH");
    require(state.expiry == 0 || state.expiry > block.timestamp, "HashlockTransfer: EXPIRED_TIMELOCK");
    return true;
  }

  function resolve(
    bytes calldata encodedBalance,
    bytes calldata encodedState,
    bytes calldata encodedResolver
  ) external override view returns (Balance memory) {
    TransferState memory state = abi.decode(encodedState, (TransferState));
    TransferResolver memory resolver = abi.decode(encodedResolver, (TransferResolver));
    Balance memory balance = abi.decode(encodedBalance, (Balance));

    // If you pass in bytes32(0), payment is canceled
    // If timelock is nonzero and has expired, payment is canceled
    if (resolver.preImage != bytes32(0) && (state.expiry == 0 || state.expiry > block.timestamp)) {
      // Check hash for normal payment unlock
      bytes32 generatedHash = sha256(abi.encode(resolver.preImage));
      require(state.lockHash == generatedHash, "HashlockTransfer: INVALID_PREIMAGE");

      // Update state
      balance.amount[1] = balance.amount[0];
      balance.amount[0] = 0;
    } else {
      // To cancel, the preImage must be empty (not simply incorrect)
      require(resolver.preImage == bytes32(0), "HashlockTransfer: NONZERO_LOCKHASH");
      // There are no additional state mutations
    }

    return balance;
  }
}
