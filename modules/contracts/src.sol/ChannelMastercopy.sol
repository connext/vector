// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.7.1;
pragma experimental ABIEncoderV2;

import "./interfaces/IVectorChannel.sol";
import "./interfaces/IERC20.sol";
import "./lib/LibChannelCrypto.sol";

/// @title Vector Channel
/// @author Arjun Bhuptani <arjun@connext.network>
/// @notice
/// (a) A proxy to this contract is deployed per-channel using the ChannelFactory.sol contract
/// (b) Executes transactions dispute logic on a hardcoded channel factory
/// (c) Supports executing arbitrary CALLs when called w/ commitment that has 2 signatures

contract ChannelMastercopy is IVectorChannel {
  // Note: this is the mastercopy of channel logic, this address is managed by the ChannelFactory
  // TODO: decide which variables should be public

  using LibChannelCrypto for bytes32;

  address public masterCopy;

  mapping(bytes32 => bool) isExecuted;

  mapping(address => uint256) internal _totalDepositedA;
  mapping(address => uint256) internal _totalWithdrawn;

  address[2] private _owners;

  address public _factory;

  // TODO: receive must emit event, in order to track eth deposits
  receive() external payable {}

  modifier onlyFactory {
    require(msg.sender == _factory, "msg.sender is not the factory");
    _;
  }

  ////////////////////////////////////////
  // Public Methods

  /// @notice Contract constructor
  /// @param owners An array of unique addresses representing the participants of the channel
  function setup(address[2] memory owners) public override {
    require(_factory == address(0), "Contract has already been setup");
    _owners = owners;
    _factory = msg.sender;
  }

  /// @notice A getter function for the owners of the multisig
  /// @return An array of addresses representing the owners
  function getOwners() public override view returns (address[2] memory) {
    return _owners;
  }

  function getBalance(address assetId) public override view returns (uint256) {
    return assetId == address(0) ? address(this).balance : IERC20(assetId).balanceOf(address(this));
  }

  function depositA(address assetId, uint256 amount) public override payable {
    // WIP version just for basic testing
    if (assetId == address(0)) {
      require(msg.value == amount, "oh no");
    } else {
      require(IERC20(assetId).transferFrom(msg.sender, address(this), amount), "oh no");
    }
    // NOTE: explicitly do NOT use safemath here
    _totalDepositedA[assetId] += amount;
  }

  // Workaround, because I was not able to convince the compiler
  // to let me override the getter in the interface with the
  // auto-generated getter of an overriding state variable
  // if said variable is a mapping with a struct as value type.
  // In other words, I had to write the getter myself...
  function totalDepositedA(address assetId) public override view returns (uint256) {
    return _totalDepositedA[assetId];
  }

  // Calculated using invariant onchain properties. Note we DONT use safemath here
  function totalDepositedB(address assetId) public override view returns (uint256) {
    return getBalance(assetId) + _totalWithdrawn[assetId] - _totalDepositedA[assetId];
  }

  function managedTransfer(Balance memory balances, address assetId) public override onlyFactory {
    // TODO: This is quick-and-dirty to allow for basic testing.
    // We should add dealing with non-standard-conforming tokens,
    // unexpected reverts, avoid reentrancy, etc.
    if (assetId == address(0)) {
      balances.to[0].transfer(balances.amount[0]);
      balances.to[1].transfer(balances.amount[1]);
    } else {
      require(IERC20(assetId).transfer(balances.to[0], balances.amount[0]), "oh no");
      require(IERC20(assetId).transfer(balances.to[1], balances.amount[1]), "oh no");
    }
  }

  // Executes an arbitrary transaction out of the channel. `Data` is executed using
  // a CALL below. Note that we pass in an `amount` which represents the value
  // withdrawn regardless of whether this is a token or Eth transfer.
  function execWithdraw(
    address recipient,
    uint256 amount,
    address assetId,
    bytes memory data,
    uint256 nonce,
    bytes[] memory signatures
  ) public override {
    // Replay protection
    bytes32 transactionHash = keccak256(
      abi.encodePacked(address(this), recipient, amount, assetId, keccak256(data), nonce)
    );
    require(!isExecuted[transactionHash], "Transacation has already been executed");
    isExecuted[transactionHash] = true;

    // Validate signatures
    for (uint256 i = 0; i < _owners.length; i++) {
      require(_owners[i] == transactionHash.verifyChannelMessage(signatures[i]), "Invalid signature");
    }

    // Add to totalWithdrawn
    _totalWithdrawn[assetId] += amount;

    // Then, execute the tx
    if (assetId == address(0)) {
      execute(recipient, amount, data);
    } else {
      execute(recipient, 0, data);
    }
  }

  /// @notice Execute a CALL on behalf of the multisignature wallet
  /// @notice This is largely used for withdrawing from the channel + migrations
  /// @return success A boolean indicating if the transaction was successful or not
  function execute(
    address to,
    uint256 value,
    bytes memory data
  ) internal returns (bool success) {
    assembly {
      success := call(not(0), to, value, add(data, 0x20), mload(data), 0, 0)
    }
  }
}
