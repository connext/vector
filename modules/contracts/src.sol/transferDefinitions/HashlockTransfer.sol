// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.7.1;
pragma experimental "ABIEncoderV2";

import "../interfaces/ITransferDefinition.sol";

/// @title Hashlock Transfer
/// @notice This contract allows users to claim a payment locked in
///         the application if they provide the correct preImage. The payment is
///         reverted if not unlocked by the timelock if one is provided.

contract HashlockTransfer is ITransferDefinition {
  struct TransferState {
    bytes32 lockHash;
    uint256 expiry; // If 0, then no timelock is enforced
  }

  struct TransferResolver {
    bytes32 preImage;
  }

  string StateEncoding = "tuple(tuple(uint256[2] amount, address[2] to) balance, bytes32 lockHash, uint256 expiry)";

  string ResolverEncoding = "tuple(bytes32 preImage)";

  string Name = "HashlockTransfer";

  function getRegistryInformation() external override view returns (RegisteredTransfer memory) {
    RegisteredTransfer memory info = RegisteredTransfer({
      name: Name,
      stateEncoding: StateEncoding,
      resolverEncoding: ResolverEncoding,
      definition: address(this)
    });
    return info;
  }

  function create(bytes calldata encodedBalance, bytes calldata encodedState) external override view returns (bool) {
    TransferState memory state = abi.decode(encodedState, (TransferState));
    Balance memory balance = abi.decode(encodedBalance, (Balance));

    require(balance.amount[1] == 0, "Cannot create hashlock transfer with nonzero recipient balance");
    require(state.lockHash != bytes32(0), "Cannot create hashlock transfer with empty lockHash");
    require(state.expiry > block.number || state.expiry == 0, "Cannot create hashlock transfer with expired timelock");
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
    if (resolver.preImage != bytes32(0) && (state.expiry > block.number || state.expiry == 0)) {
      // Check hash for normal payment unlock
      bytes32 generatedHash = sha256(abi.encode(resolver.preImage));
      require(state.lockHash == generatedHash, "Hash generated from preimage does not match hash in state");

      // Update state
      balance.amount[1] = balance.amount[0];
      balance.amount[0] = 0;
    }

    return balance;
  }
}
