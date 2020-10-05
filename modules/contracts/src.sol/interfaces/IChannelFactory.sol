// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.7.1;
pragma experimental ABIEncoderV2;

import "./IVectorChannel.sol";
import "./Types.sol";


interface IChannelFactory {

    event ChannelCreation(IVectorChannel channel);

    function getMastercopy() external view returns (address);

    function proxyCreationCode() external pure returns (bytes memory);

    function getChannelAddress(
        address alice,
        address bob,
        uint256 chainId
    ) external view returns (address);

    function createChannel(
        address alice,
        address bob,
        uint256 chainId
    ) external returns (IVectorChannel);

    function createChannelAndDepositA(
        address alice,
        address bob,
        uint256 chainId,
        address assetId,
        uint256 amount
    ) external payable returns (IVectorChannel);

}
