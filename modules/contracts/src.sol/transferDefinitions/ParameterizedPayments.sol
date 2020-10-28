// SPDX-License-Identifier: UNLICENSED 
pragma solidity ^0.7.1; 
pragma experimental "ABIEncoderV2";

import "../interfaces/ITransferDefinition.sol";
import "../lib/LibChannelCrypto.sol";
import "../lib/SafeMath.sol";
import "../lib/strings.sol";

/// @title ParameterizedPayments
/// @notice This contract allows a series of payments to be bundled up
///         as a single payment constrained to a set of specified parameters.
///
///         A parameterized payment can specify:
///         - rate: how much value can be transferred over time
///         - expiration: the latest time in which value can transfer
///         - UUID: a unique identifier         

contract ParameterizedPayments is ITransferDefinition {
  using LibChannelCrypto for bytes32;
  using SafeMath for uint256;
  using strings for *;

  // Rate = deltaAmount/deltaTime
  struct Rate {
    uint256 deltaAmount;
    uint256 deltaTime;
  }

  // TransferState contains the payment data
  struct TransferState {
    address receiver;
    uint256 start;
    uint256 expiration;
    bytes32 UUID;
    Rate rate;
  }

  // Encapsulates the UUID and payment amount to make signing easier - see below TransferResolver
  struct ResolverData {
    bytes32 UUID;
    uint256 paymentAmountTaken;
  }

  // TransferResolver contains the UUID of the payment we're signing to prevent replay attacks,
  // the payment amount taken, and a signature of this data
  struct TransferResolver {
    ResolverData data;
    bytes payeeSignature;
  }

  string RateEncoding = "tuple(uint256 deltaAmount, uint256 deltaTime)";
  string StateEncoding = 
    "tuple(address receiver, uint256 start, uint256 expiration, bytes32 UUID, "
    .concat(RateEncoding)
    .concat(")");
  string ResolverDataEncoding = "tuple(bytes32 UUID, uint256 paymentAmountTaken)";
  string ResolverEncoding = 
    "tuple("
    .concat(ResolverDataEncoding)
    .concat(", bytes payeeSignature)");
  string Name = "ParameterizedPayments";

  function getRegistryInformation() external override view returns (RegisteredTransfer memory) {
    RegisteredTransfer memory info = RegisteredTransfer({
      name: Name,
      stateEncoding: StateEncoding,
      resolverEncoding: ResolverEncoding,
      definition: address(this)
    });
    return info;
  }

  /// @notice Creates a parameterized payment from the payer (creator) to the payee (resolver)
  /// @param encodedBalance balance the creator/payer is putting into the transfer
  /// @param encodedState encoded transfer parameters
  /// @dev encoded parameter data contains the receiver address, the expiration, the UUID, and the rate
  function create(
    bytes calldata encodedBalance,
    bytes calldata encodedState
  ) external override view returns (bool) {
    // Unpack balance & state
    Balance memory balance = abi.decode(encodedBalance, (Balance));
    TransferState memory state = abi.decode(encodedState, (TransferState));
    Rate memory rate = state.rate;

    // Receiver should not have an initial balance within the transfer
    require(balance.amount[1] == 0, "Cannot create parameterized payment with nonzero recipient init balance");

    // Parameterized payment checks
    require(rate.deltaAmount >= 1, "Per-unit amount must be at least 1 wei");
    require(rate.deltaTime >= 15, "Per-unit time must be at least 15 seconds");
    require(state.expiration > block.timestamp + 3 days, "Expiration must be at least 3 days in the future.");

    // Sanity checks
    require(state.receiver != address(0x0), "Receiver address cannot be the zero address!");
    require(state.UUID != bytes32(0), "UUID cannot be null.");

    return true;
  }

  /// @notice Resolves a parameterized payment from the payer (creator) to the payee (resolver)
  /// @param encodedBalance balance the creator/payer is putting into the transfer; same as in create
  /// @param encodedState encoded transfer parameters
  /// @param encodedResolver contains the resolution data (UUID, payment amount) and a signature of said data
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

    // Signature check
    bytes32 hashedData = keccak256(abi.encode(data));
    require(state.receiver == LibChannelCrypto.verifyChannelMessage(hashedData, resolver.payeeSignature));

    // State & resolver UUID should match
    require(state.UUID == data.UUID);

    // Expiration check
    require(block.timestamp < state.expiration);

    // Rate should not be exceeded; multiply by large number to avoid precision errors
    uint256 timeElapsed = block.timestamp.sub(state.start);
    uint256 averageRate = data.paymentAmountTaken.div(timeElapsed.multiply(2**64));
    uint256 allowedRate = state.rate.deltaAmount.div(state.rate.deltaTime.multiply(2**64));
    require(averageRate <= allowedRate);

    // Transfer the payment amount
    balance.amount[0] = balance.amount[0].sub(data.paymentAmountTaken);
    balance.amount[1] = balance.amount[1].add(data.paymentAmountTaken);

    return balance;
  }
}
