// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.7.1;
pragma experimental ABIEncoderV2;

import "./interfaces/IChannelMiddleware.sol";
import "./ReentrancyGuard.sol";
import "./ChannelMastercopy.sol";

contract ChannelMiddleware is IChannelMiddleware, ReentrancyGuard {

  address private immutable mastercopy;
  
  constructor(address _mastercopy) {
    mastercopy = _mastercopy;
  }

  function getMastercopy() override external view returns(address) {
    return mastercopy;
  }

  fallback() external payable nonReentrant {
    assembly {
      let _masterCopy := and(sload(0), 0xffffffffffffffffffffffffffffffffffffffff)
      calldatacopy(0, 0, calldatasize())
      let success := delegatecall(gas(), _masterCopy, 0, calldatasize(), 0, 0)
      returndatacopy(0, 0, returndatasize())
      if eq(success, 0) { revert(0, returndatasize()) }
      return(0, returndatasize())
    }
  }
}