// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.7.1;
pragma experimental ABIEncoderV2;


interface IChannelFactory {

    function getChannelAddress(
        address initiator,
        address responder
    ) external returns (address channel);

    function createChannel(
        address initiator,
        address responder
    ) external returns (address channel);

    function proxyCreationCode() external pure returns (bytes memory);

    function proxyRuntimeCode() external pure returns (bytes memory);

}
