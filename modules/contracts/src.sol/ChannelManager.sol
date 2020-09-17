// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.7.1;
pragma experimental ABIEncoderV2;

import "./interfaces/IVectorChannel.sol";
import "./ChannelFactory.sol";
import "./Adjudicator.sol";


contract ChannelManager is ChannelFactory, Adjudicator {

    constructor(
        IVectorChannel masterCopy
    ) ChannelFactory(masterCopy) {}

}
