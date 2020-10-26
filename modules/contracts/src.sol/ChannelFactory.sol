// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.7.1;
pragma experimental ABIEncoderV2;

import "./interfaces/IChannelFactory.sol";
import "./interfaces/IVectorChannel.sol";
import "./Proxy.sol";
import "./lib/LibAsset.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";


/// @title Channel Factory - Allows us to create new channel proxy contract
contract ChannelFactory is IChannelFactory {

    bytes public constant override proxyCreationCode = type(Proxy).creationCode;

    bytes32 private constant domainSalt = keccak256("vector");

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
        return address(uint256(
            keccak256(abi.encodePacked(
                byte(0xff),
                address(this),
                generateSalt(alice, bob, chainId),
                keccak256(abi.encodePacked(proxyCreationCode, mastercopy))
            ))
        ));
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
        returns (IVectorChannel channel)
    {
        return _createChannel(alice, bob, chainId);
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
        returns (IVectorChannel channel)
    {
        channel = _createChannel(alice, bob, chainId);
        // TODO: This is a bit ugly and inefficient, but alternative solutions are too.
        // Do we want to keep it this way?
        if (!LibAsset.isEther(assetId)) {
            require(
                IERC20(assetId).transferFrom(msg.sender, address(this), amount),
                "ChannelFactory: token transferFrom failed"
            );
            require(
                IERC20(assetId).approve(address(channel), amount),
                "ChannelFactory: token approve failed"
            );
        }
        channel.depositAlice{value: msg.value}(assetId, amount);
    }

    ////////////////////////////////////////
    // Internal Methods

    function _createChannel(
        address alice,
        address bob,
        uint256 chainId
    )
        internal
        returns (IVectorChannel channel)
    {
        channel = deployChannelProxy(alice, bob, chainId);
        channel.setup(alice, bob);
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
        returns (IVectorChannel)
    {
        bytes32 salt = generateSalt(alice, bob, chainId);
        Proxy proxy = new Proxy{salt: salt}(mastercopy);
        return IVectorChannel(address(proxy));
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
        return keccak256(
            abi.encodePacked(
                alice,
                bob,
                chainId,
                domainSalt
            )
        );
    }

}
