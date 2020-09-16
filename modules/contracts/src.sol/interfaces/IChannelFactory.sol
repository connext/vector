// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.7.1;
pragma experimental ABIEncoderV2;

import "./IVectorChannel.sol";


interface IChannelFactory {

    event ChannelCreation(IVectorChannel channel);

    function proxyCreationCode() external pure returns (bytes memory);

    function getChannelAddress(
        address initiator,
        address responder
    ) external view returns (address);

    function createChannel(
        address initiator,
        address responder
    ) external returns (IVectorChannel);

    function createChannelAndDepositA(
        address initiator,
        address responder,
        address assetId,
        uint256 amount
    ) external payable returns (IVectorChannel);

}
