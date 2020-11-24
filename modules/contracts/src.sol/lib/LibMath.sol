// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.7.1;
pragma experimental ABIEncoderV2;

library LibMath {
    // Returns the maximum uint256 for an addition that would overflow
    // (saturation arithmetic)
    function satAdd(uint256 x, uint256 y) internal pure returns (uint256) {
        uint256 sum = x + y;
        return sum >= x ? sum : type(uint256).max;
    }
}
