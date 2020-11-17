// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.7.1;
pragma experimental ABIEncoderV2;

import "./interfaces/IChannelMiddleware.sol";
import "./ChannelMastercopy.sol";

contract ChannelMiddleware is IChannelMiddleware {
  address private immutable mastercopy;
  uint256 public lock = OPEN;

  uint256 private constant OPEN = 1;
  uint256 private constant LOCKED = 2;

  constructor(address _mastercopy) {
    mastercopy = _mastercopy;
  }

  function getMastercopy() override external view returns(address) {
    return mastercopy;
  }

  receive() external payable {}

  fallback() external payable {
    require(lock == OPEN, "ReentrancyGuard: REENTRANT_CALL");
    lock = LOCKED;
    assembly {
      let _masterCopy := and(sload(0), 0xffffffffffffffffffffffffffffffffffffffff)
      calldatacopy(0, 0, calldatasize())
      let success := delegatecall(gas(), _masterCopy, 0, calldatasize(), 0, 0)
      returndatacopy(0, 0, returndatasize())
      if eq(success, 0) { revert(0, returndatasize()) }
      sstore(lock.slot, OPEN)
      return(0, returndatasize())
    }
  }
}
