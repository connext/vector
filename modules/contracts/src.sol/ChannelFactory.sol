// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.7.1;
pragma experimental ABIEncoderV2;

import "./interfaces/IChannelFactory.sol";
import "./interfaces/IVectorChannel.sol";
import "./interfaces/IERC20.sol";
import "./Proxy.sol";


/// @title Channel Factory - Allows us to create new channel proxy contract
contract ChannelFactory is IChannelFactory {

    IVectorChannel public immutable masterCopy;

    bytes32 private constant domainSalt = keccak256("vector");
    bytes public constant override proxyCreationCode = type(Proxy).creationCode;

    constructor(IVectorChannel _masterCopy) {
        masterCopy = _masterCopy;
    }

    /// @dev Allows us to get the address for a new channel contract created via `createChannel`
    /// @param initiator address of one of the two participants in the channel
    /// @param responder address of the other channel participant
    function getChannelAddress(
        address initiator,
        address responder
    )
        public
        override
        view
        returns (address)
    {
        bytes32 salt = generateSalt(initiator, responder);
        bytes32 initCodeHash = keccak256(abi.encodePacked(proxyCreationCode, masterCopy));

        return address(uint256(
            keccak256(abi.encodePacked(
                byte(0xff), address(this), salt, initCodeHash
            ))
        ));
    }

    /// @dev Allows us to create new channel contract and get it all set up in one transaction
    /// @param initiator address of one of the two participants in the channel
    /// @param responder address of the other channel participant
    function createChannel(
        address initiator,
        address responder
    )
        public
        override
        returns (IVectorChannel channel)
    {
        channel = deployChannelProxy(initiator, responder);
        channel.setup([initiator, responder]);
        emit ChannelCreation(channel);
    }

    /// @dev Allows us to create new channel contract, get it set up, and fund it
    /// with a call to `depositA` in one transaction
    /// @param initiator address of one of the two participants in the channel
    /// @param responder address of the other channel participant
    function createChannelAndDepositA(
        address initiator,
        address responder,
        address assetId,
        uint256 amount
    )
        public
        payable
        override
        returns (IVectorChannel channel)
    {
        channel = createChannel(initiator, responder);

        // TODO: This is a bit ugly and inefficient, but alternative solutions are too.
        // Do we want to keep it this way?

        if (assetId != address(0)) {
            require(
                IERC20(assetId).transferFrom(msg.sender, address(this), amount),
                "ChannelFactory: token transferFrom failed"
            );
            require(
                IERC20(assetId).approve(address(channel), amount),
                "ChannelFactory: token approve failed"
            );

        }

        channel.depositA{value: msg.value}(assetId, amount);
    }

    /// @dev Allows us to create new channel contact using CREATE2
    /// @dev This method is only meant as an utility to be called from other methods
    /// @param initiator address of one of the two participants in the channel
    /// @param responder address of the other channel participant
    function deployChannelProxy(
        address initiator,
        address responder
    )
        internal
        returns (IVectorChannel)
    {
        bytes32 salt = generateSalt(initiator, responder);
        Proxy proxy = new Proxy{salt: salt}(address(masterCopy));
        return IVectorChannel(address(proxy));
    }

    function generateSalt(
        address initiator,
        address responder
    )
        internal
        pure
        returns (bytes32)
    {
        return keccak256(
            abi.encodePacked(
                initiator,
                responder,
                chainId(),
                domainSalt
            )
        );
    }

    function chainId() internal pure returns (uint256 id) {
        // solium-disable-next-line security/no-inline-assembly
        assembly {
            id := chainid()
        }
    }

}
