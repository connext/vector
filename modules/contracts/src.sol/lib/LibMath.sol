// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.7.1;
pragma experimental ABIEncoderV2;

/// @title LibMath
/// @author Connext <support@connext.network>
/// @notice This library allows functions that would otherwise overflow and
///         revert if SafeMath was used to instead return the UINT_MAX. In the
///         adjudicator, this is used to ensure you can get the majority of
///         funds out in the event your balance > UINT_MAX and there is an
///         onchain dispute.
library LibMath {
    /// @dev Returns the maximum uint256 for an addition that would overflow
    ///      (saturation arithmetic)
    function satAdd(uint256 x, uint256 y) internal pure returns (uint256) {
        uint256 sum = x + y;
        return sum >= x ? sum : type(uint256).max;
    }
}
