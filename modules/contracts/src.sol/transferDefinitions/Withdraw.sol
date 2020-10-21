// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.7.1;
pragma experimental "ABIEncoderV2";

import "../interfaces/ITransferDefinition.sol";
import "../lib/LibChannelCrypto.sol";

/// @title Withdraw
/// @notice This contract burns the initiator's funds if a mutually signed
///         withdraw commitment can be generated

contract Withdraw is ITransferDefinition {
  using LibChannelCrypto for bytes32;

  struct TransferState {
    bytes initiatorSignature;
    address initiator;
    address responder;
    bytes32 data;
    uint256 nonce; // included so that each withdraw commitment has a unique hash
    uint256 fee;
  }

  struct TransferResolver {
    bytes responderSignature;
  }

  string StateEncoding = "tuple(bytes initiatorSignature, address initiator, address responder, bytes32 data, uint256 nonce, uint256 fee)";

  string ResolverEncoding = "tuple(bytes responderSignature)";

  string Name = "Withdraw";

  function getRegistryInformation() external override view returns (RegisteredTransfer memory) {
    RegisteredTransfer memory info = RegisteredTransfer({
      name: Name,
      stateEncoding: StateEncoding,
      resolverEncoding: ResolverEncoding,
      definition: address(this)
    });
    return info;
  }

  function create(bytes calldata encodedBalance, bytes calldata encodedState) external override pure returns (bool) {
    TransferState memory state = abi.decode(encodedState, (TransferState));
    Balance memory balance = abi.decode(encodedBalance, (Balance));
    require(balance.amount[1] == 0, "Withdraw: NONZERO_RECIPIENT_BALANCE");
    require(state.initiator != address(0) && state.responder != address(0), "Withdraw: EMPTY_SIGNERS");
    require(state.data != bytes32(0), "Withdraw: EMPTY_DATA");
    require(state.nonce != uint256(0), "Withdraw: EMPTY_NONCE");
    require(state.fee <= balance.amount[0], "Withdraw: INSUFFICIENT_BALANCE");
    require(state.data.checkSignature(state.initiatorSignature, state.initiator), "Withdraw: INVALID_INITIATOR_SIG");
    return true;
  }

  function resolve(
    bytes calldata encodedBalance,
    bytes calldata encodedState,
    bytes calldata encodedResolver
  ) external override pure returns (Balance memory) {
    TransferState memory state = abi.decode(encodedState, (TransferState));
    TransferResolver memory resolver = abi.decode(encodedResolver, (TransferResolver));
    Balance memory balance = abi.decode(encodedBalance, (Balance));

    // Allow for a withdrawal to be canceled if an empty signature is passed in
    // Should have *specific* cancellation action, not just any invalid sig
    bytes memory b = new bytes(65);
    if (keccak256(resolver.responderSignature) == keccak256(b)) {
      // Withdraw should be cancelled, no state manipulation needed
    } else {
      require(
        state.data.checkSignature(resolver.responderSignature, state.responder),
        "Withdraw.resolve: INVALID_RESPONDER_SIG"
      );
      // Reduce withdraw amount by optional fee
      // It's up to the offchain validators to ensure that the withdraw commitment takes this fee into account
      balance.amount[1] = state.fee;
      balance.amount[0] = 0;
    }

    return balance;
  }
}
