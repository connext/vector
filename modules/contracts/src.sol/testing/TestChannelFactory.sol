// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.7.1;
pragma experimental ABIEncoderV2;

import "../interfaces/IVectorChannel.sol";
import "../ChannelFactory.sol";

/// @title TestChannelFactory
/// @author Layne Haber <layne@connext.network>
/// @notice This factory is used for testing *ONLY* and allows you to
///         deploy contracts without setting them up (to run the CMCCore
///         setup tests)
contract TestChannelFactory is ChannelFactory {
  constructor(address _mastercopy, uint256 _chainId) ChannelFactory(_mastercopy, _chainId) {}

  function deployChannelProxyWithoutSetup(address alice, address bob) public returns (address) {
    return deployChannelProxy(alice, bob);
  }

  function createChannelWithoutSetup(address alice, address bob) public returns (address channel) {
    channel = deployChannelProxy(alice, bob);
    emit ChannelCreation(channel);
    return channel;
  }
}
