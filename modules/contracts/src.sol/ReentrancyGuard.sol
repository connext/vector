// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.7.1;
pragma experimental ABIEncoderV2;

// A "mutex" reentrancy guard, heavily influenced by OpenZeppelin's
contract ReentrancyGuard {
    uint256 private constant OPEN = 1;
    uint256 private constant LOCKED = 2;

    uint256 public lock;

    function setup() internal {
        lock = OPEN;
    }

    modifier nonReentrant() {
        require(lock == OPEN, "ReentrancyGuard: REENTRANT_CALL");
        lock = LOCKED;
        _;
        lock = OPEN;
    }

    modifier nonReentrantView() {
        require(lock == OPEN, "ReentrancyGuard: REENTRANT_CALL");
        _;
    }
}
