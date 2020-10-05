// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.7.1;
pragma experimental ABIEncoderV2;

import "./interfaces/ICMCCore.sol";

contract CMCCore is ICMCCore {
  // mastercopy needs to be first declared variable
  // in order to ensure storage alignment with the proxy
  address public mastercopy;

  address public alice;
  address public bob;

  // Prevents us from calling methods directly from the mastercopy contract
  modifier onlyOnProxy {
    require(mastercopy != address(0), "This contract is the mastercopy");
    _;
  }

  /// @notice Contract constructor for Proxied copies
  /// @param _alice: Address representing user with function deposit
  /// @param _bob: Address representing user with multisig deposit
  function setup(address _alice, address _bob) external override onlyOnProxy {
    require(alice == address(0), "Channel has already been setup");
    require(_alice != address(0) && _bob != address(0), "Address zero not allowed as channel participant");
    require(_alice != _bob, "Channel participants must be different from each other");
    alice = _alice;
    bob = _bob;
  }

  /// @notice A getter function for the participants of the multisig
  /// @return An array of addresses representing the participants
  function getParticipants() external override view onlyOnProxy returns (address[2] memory) {
    return [alice, bob];
  }
}
