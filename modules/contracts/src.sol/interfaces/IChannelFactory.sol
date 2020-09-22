// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.7.1;
pragma experimental ABIEncoderV2;

import "./IVectorChannel.sol";
import "./Types.sol";


interface IChannelFactory {

    event ChannelCreation(IVectorChannel channel);

    function proxyCreationCode() external pure returns (bytes memory);

    function getChannelAddress(
        address initiator,
        address counterparty
    ) external view returns (address);

    function createChannel(
        address counterparty
    ) external returns (IVectorChannel);

    function createChannelAndDepositA(
        address counterparty,
        address assetId,
        uint256 amount
    ) external payable returns (IVectorChannel);


}

