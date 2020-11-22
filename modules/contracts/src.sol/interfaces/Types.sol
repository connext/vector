// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.7.1;
pragma experimental ABIEncoderV2;

struct Balance {
    uint256[2] amount; // [alice, bob] in channel, [initiator, responder] in transfer
    address payable[2] to; // [alice, bob] in channel, [initiator, responder] in transfer
}
