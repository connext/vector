// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.7.1;
pragma experimental ABIEncoderV2;


struct LatestDeposit {
    uint256 amount;
    uint256 nonce;
}

struct Balance {
    uint256[] amount;
    address[] to;
    //TODO should we just make assetId part of the Balance?
}
