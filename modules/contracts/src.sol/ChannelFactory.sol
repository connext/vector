// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.7.1;
pragma experimental ABIEncoderV2;

import "./interfaces/IChannelFactory.sol";
import "./interfaces/IVectorChannel.sol";
import "./lib/LibAsset.sol";
import "./lib/LibERC20.sol";
import "./lib/MinimalProxyFactory.sol";

/// @title Channel Factory - Allows us to create new channel proxy contract
/// @author Connext & Friends <hello@connext.network>
contract ChannelFactory is IChannelFactory, MinimalProxyFactory {
    address private immutable mastercopy;

    constructor(address _mastercopy) {
        mastercopy = _mastercopy;
    }

    ////////////////////////////////////////
    // Public Methods

    /// @dev Allows us to get the mastercopy that this factory will deploy channels against
    function getMastercopy() external override view returns(address) {
      return mastercopy;
    }

    function proxyCreationCode() external override view returns (bytes memory) {
      return _generateMinimalProxyInitCode(mastercopy);
    }

    /// @dev Allows us to get the address for a new channel contract created via `createChannel`
    /// @param alice address of one of the two participants in the channel
    /// @param bob address of the other channel participant
    function getChannelAddress(
        address alice,
        address bob,
        uint256 chainId
    )
        external
        override
        view
        returns (address)
    {
        return _calculateMinimalProxyDeploymentAddress(
            mastercopy,
            generateSalt(alice, bob, chainId)
        );
    }

    /// @dev Allows us to create new channel contract and get it all set up in one transaction
    /// @param alice address of one of the channel participants
    /// @param bob address of the other channel participant
    function createChannel(
        address alice,
        address bob,
        uint256 chainId
    )
        external
        override
        returns (address channel)
    {
        _createChannel(alice, bob, chainId);
    }

    /// @dev Allows us to create a new channel contract and fund it in one transaction
    /// @param bob address of the other channel participant
    function createChannelAndDepositAlice(
        address alice,
        address bob,
        uint256 chainId,
        address assetId,
        uint256 amount
    )
        external
        payable
        override
        returns (address channel)
    {
        channel = _createChannel(alice, bob, chainId);
        // TODO: This is a bit ugly and inefficient, but alternative solutions are too.
        // Do we want to keep it this way?
        if (!LibAsset.isEther(assetId)) {
            require(
                LibERC20.transferFrom(assetId, msg.sender, address(this), amount),
                "ChannelFactory: token transferFrom failed"
            );
            require(
                LibERC20.approve(assetId, address(channel), amount),
                "ChannelFactory: token approve failed"
            );
        }
        IVectorChannel(channel).depositAlice{value: msg.value}(assetId, amount);
    }

    ////////////////////////////////////////
    // Internal Methods

    function _createChannel(
        address alice,
        address bob,
        uint256 chainId
    )
        internal
        returns (address channel)
    {
        channel = deployChannelProxy(alice, bob, chainId);
        IVectorChannel(channel).setup(alice, bob);
        emit ChannelCreation(channel);
        return channel;
    }

    /// @dev Allows us to create new channel contact using CREATE2
    /// @dev This method is only meant as an utility to be called from other methods
    /// @param alice address of one of the two participants in the channel
    /// @param bob address of the other channel participant
    function deployChannelProxy(
        address alice,
        address bob,
        uint256 chainId
    )
        internal
        returns (address)
    {
        return _deployMinimalProxy(mastercopy, generateSalt(alice, bob, chainId));
    }

    function generateSalt(
        address alice,
        address bob,
        uint256 chainId
    )
        internal
        pure
        returns (bytes32)
    {
        return keccak256(abi.encodePacked(alice, bob, chainId));
    }

}
