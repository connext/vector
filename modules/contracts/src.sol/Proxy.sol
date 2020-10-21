// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.7.1;
pragma experimental ABIEncoderV2;

import "./ProxyData.sol";

// A proxy, heavily influenced by Gnosis'
contract Proxy is ProxyData {

    constructor(address mc) ProxyData(mc) {
        require(mc != address(0), "Invalid master copy address provided");
    }

    /// @dev Fallback function forwards all transactions to mastercopy
    /// and returns all received return data.
    fallback() external payable {
        // solium-disable-next-line security/no-inline-assembly
        assembly {
            let mc := and(sload(0), 0xffffffffffffffffffffffffffffffffffffffff)
            calldatacopy(0, 0, calldatasize())
            let success := delegatecall(gas(), mc, 0, calldatasize(), 0, 0)
            returndatacopy(0, 0, returndatasize())
            if eq(success, 0) { revert(0, returndatasize()) }
            return(0, returndatasize())
        }
    }

}
