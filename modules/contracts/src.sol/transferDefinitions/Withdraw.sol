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
    Balance balance;
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

  function stateEncoding() external override pure returns (string memory) {
    return
      "tuple(tuple(uint256[2] amount, address[2] to) balance, bytes initiatorSignature, address initiator, address responder, bytes32 data, uint256 nonce, uint256 fee)";
  }

  function resolverEncoding() external override pure returns (string memory) {
    return "tuple(bytes responderSignature)";
  }

  function create(bytes calldata encodedState) external override pure returns (bool) {
    TransferState memory state = abi.decode(encodedState, (TransferState));

    require(state.balance.amount[1] == 0, "Cannot create withdraw with nonzero recipient balance");
    // TODO
    // require(state.initiatorSignature != bytes(0), "Cannot create withdraw with no initiator signature");
    require(
      state.initiator != address(0) && state.responder != address(0),
      "Cannot create withdraw with empty signers"
    );
    require(state.data != bytes32(0), "Cannot create withdraw with empty commitment data");
    require(state.nonce != uint256(0), "Cannot create withdraw with empty nonce");
    require(state.fee <= state.balance.amount[0], "Cannot create withdraw with fee greater than amount in balance");
    return true;
  }

  function resolve(bytes calldata encodedState, bytes calldata encodedResolver)
    external
    override
    pure
    returns (Balance memory)
  {
    TransferState memory state = abi.decode(encodedState, (TransferState));
    TransferResolver memory resolver = abi.decode(encodedResolver, (TransferResolver));

    require(
      state.initiator == state.data.verifyChannelMessage(state.initiatorSignature),
      "invalid withdrawer signature"
    );

    // Allow for a withdrawal to be canceled if an incorrect signature is passed in
    if (state.responder == state.data.verifyChannelMessage(resolver.responderSignature)) {
      // Reduce withdraw amount by optional fee -- note that it's up to the offchain validators to ensure
      // That the withdraw commitment takes this fee into account
      state.balance.amount[1] = state.fee;
      state.balance.amount[0] = 0;
    }

    return state.balance;
  }
}
