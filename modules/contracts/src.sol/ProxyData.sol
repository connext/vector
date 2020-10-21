// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.7.1;
pragma experimental ABIEncoderV2;

// This contract needs to be the top-most in the inheritance hierarchy,
// in order to ensure storage alignment with the proxy

contract ProxyData {

    address internal mastercopy;

    constructor(address mc) {
        mastercopy = mc;
    }

}
