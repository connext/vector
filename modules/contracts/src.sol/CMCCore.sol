// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.7.1;
pragma experimental ABIEncoderV2;

import "./interfaces/ICMCCore.sol";

contract CMCCore is ICMCCore {
  // masterCopy needs to be first declared variable
  // in order to ensure storage alignment with the proxy
  address public masterCopy;

  address internal alice;
  address internal bob;

  mapping(address => uint256) internal _totalDepositedA;
  mapping(address => uint256) internal _totalWithdrawn;

  // Prevents us from calling methods directly from the mastercopy contract
  modifier onlyOnProxy {
    require(masterCopy != address(0), "This contract is the mastercopy");
    _;
  }

  /// @notice Contract constructor for Proxied copies
  /// @param _alice: Address representing user with function deposit
  /// @param _bob: Address representing user with multisig deposit
  function setup(address _alice, address _bob) external override onlyOnProxy {
    require(alice == address(0) && bob == address(0), "Channel has already been setup");
    alice = _alice;
    bob = _bob;
  }

  /// @notice A getter function for the participants of the multisig
  /// @return An array of addresses representing the participants
  function getParticipants() external override view onlyOnProxy returns (address[2] memory) {
    return [alice, bob];
  }
}
