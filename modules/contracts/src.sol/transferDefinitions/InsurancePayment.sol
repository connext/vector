// SPDX-License-Identifier: UNLICENSED 
pragma solidity ^0.7.1; 
pragma experimental "ABIEncoderV2";

import "../interfaces/ITransferDefinition.sol";
import "../lib/SafeMath.sol";
import "../lib/LibChannelCrypto.sol";
import "../lib/strings.sol";

/// @title InsurancePayment
/// @notice This contract allows someone to put up a payment as "insurance"
///         which can be used to guarantee virtually anything. The insurance
///         can only be unlocked by a specified mediator, and will be refunded
///         to the guarantor after a specified expiration period, or if
///         explicitly cancelled by the receiver.

contract InsurancePayment is ITransferDefinition {
  using SafeMath for uint256;
  using strings for *;

  // TransferState contains the payment data
  struct TransferState {
    address receiver;
    address mediator;
    uint256 collateral;
    uint256 expiration;
    bytes32 UUID;
  }

  // Encapsulates the UUID and payment amount to make signing easier - see below TransferResolver
  struct ResolverData {
    uint256 amount;
    bytes32 UUID;
  }

  // TransferResolver contains the UUID of the payment, the amount, and a signature
  struct TransferResolver {
    ResolverData data;
    bytes signature;
  }

  /* solhint-disable */
  string StateEncoding = "tuple(address receiver, address mediator, uint256 collateral, uint256 expiration, bytes32 UUID)";
  string ResolverDataEncoding = "tuple(uint256 amount, bytes32 UUID)";
  string ResolverEncoding = 
    "tuple("
    .concat(ResolverDataEncoding)
    .concat(", bytes signature)");
  string Name = "InsurancePayment";
  /* solhint-enable */

  function getRegistryInformation() external override view returns (RegisteredTransfer memory) {
    RegisteredTransfer memory info = RegisteredTransfer({
      name: Name,
      stateEncoding: StateEncoding,
      resolverEncoding: ResolverEncoding,
      definition: address(this)
    });
    return info;
  }

  /// @notice Creates an insurancePayment from the guarantor to the receiver
  /// @param encodedBalance balance the guarantor is putting into the transfer
  /// @param encodedState encoded transfer parameters (insurance payment info)
  /// @dev encoded state info contains the receiver & mediator addresses, collateral amount, expiration, and UUID
  function create(
		bytes calldata encodedBalance,
		bytes calldata encodedState
	) external override view returns (bool) {
    Balance memory balance = abi.decode(encodedBalance, (Balance));
    TransferState memory state = abi.decode(encodedState, (TransferState));

    // Receiver should not have an initial balance within the transfer
    require(balance.amount[1] == 0, "Cannot create parameterized payment with nonzero recipient init balance");

    // Insurance payment checks
    require(state.expiration > block.timestamp + 3 days, "Expiration must be at least 3 days in the future.");

    // Sanity checks
    require(state.receiver != address(0x0), "Receiver address cannot be the zero address!");
    require(state.mediator != address(0x0), "Mediator address cannot be the zero address!");
    require(state.UUID != bytes32(0), "UUID cannot be null.");
    require(state.collateral >= 1 wei, "Collateral must be nonzero");

    return true;
  }

  /// @notice Resolves an insurance payment with a mediator signature, or cancels it with the receiver signature
  /// @param encodedBalance balance the guarantor is putting into the tranfser
  /// @param encodedState encoded transfer parameters (insurance payment info)
  /// @param encodedResolver contains the resolution data & the mediator signature
  function resolve(
    bytes calldata encodedBalance,
    bytes calldata encodedState,
    bytes calldata encodedResolver
  ) external override view returns (Balance memory) {
    // Unpack balance, state, resolver, & resolverdata
    Balance memory balance = abi.decode(encodedBalance, (Balance));
    TransferState memory state = abi.decode(encodedState, (TransferState));
    TransferResolver memory resolver = abi.decode(encodedResolver, (TransferResolver));
    ResolverData memory data = resolver.data;

    // State & resolver UUID should match
    require(state.UUID == data.UUID, "UUID did not match!");

    // Expiration check
    require(block.timestamp < state.expiration, "Insurance payment expired.");

    // Signature check - receiver signature cancels the insurance payment; mediator signature completes it
    bytes32 hashedData = keccak256(abi.encode(data));
    address signer = LibChannelCrypto.verifyChannelMessage(hashedData, resolver.signature);
    
    if (signer == state.receiver) return balance;

    require(signer == state.mediator, "Signature did not verify!");

    // Guarantor forfeits the amount signed by the mediator
    balance.amount[0] = balance.amount[0].sub(data.amount);
    balance.amount[1] = balance.amount[1].add(data.amount);

    return balance;
  }
}
