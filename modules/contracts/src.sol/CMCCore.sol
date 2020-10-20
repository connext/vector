// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.7.1;
pragma experimental ABIEncoderV2;

import "./interfaces/ICMCCore.sol";
import "./ProxyData.sol";

contract CMCCore is ProxyData(address(0)), ICMCCore {
  address internal alice;
  address internal bob;

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

  /// @notice A getter function for the mastercopy of the multisig
  /// @return The mastercopy address the channel was created with
  function getMastercopy() external override view onlyOnProxy returns (address) {
    return mastercopy;
  }

  /// @notice A getter function for the bob of the multisig
  /// @return Bob's signer address
  function getAlice() external override view onlyOnProxy returns (address) {
    return alice;
  }

  /// @notice A getter function for the bob of the multisig
  /// @return Alice's signer address
  function getBob() external override view onlyOnProxy returns (address) {
    return bob;
  }
}
