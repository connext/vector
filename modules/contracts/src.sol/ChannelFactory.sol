// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.7.1;
pragma experimental ABIEncoderV2;

import "./interfaces/IChannelFactory.sol";
import "./interfaces/IVectorChannel.sol";
import "./interfaces/IAdjudicator.sol";
import "./Proxy.sol";
import "./shared/IERC20.sol";


/// @title Channel Factory - Allows us to create new channel proxy contract
contract ChannelFactory is IChannelFactory {

    IVectorChannel immutable public masterCopy;
    IAdjudicator immutable public adjudicator;

    string constant domainSalt = "vector";

    constructor(IVectorChannel _masterCopy, IAdjudicator _adjudicator) {
        masterCopy = _masterCopy;
        adjudicator = _adjudicator;
    }

    /// @dev Allows us to retrieve the creation code used for the Proxy deployment.
    /// @dev With this it is easily possible to calculate predicted address.
    function proxyCreationCode() public override pure returns (bytes memory) {
        return type(Proxy).creationCode;
    }

    /// @dev Allows us to retrieve the runtime code of a deployed Proxy.
    /// @dev This can be used to check that the expected Proxy was deployed.
    /// @dev TODO: Deployment will use 5% less gas if we rm this, do we really need it?
    function proxyRuntimeCode() public override pure returns (bytes memory) {
        return type(Proxy).runtimeCode;
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
    {
        IVectorChannel channel = deployChannelProxy(initiator, responder);
        revert(string(abi.encodePacked(channel)));
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
        channel.setup([initiator, responder], adjudicator);
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
        Proxy proxy = deployProxy(address(masterCopy), salt);
        return IVectorChannel(address(proxy));
    }

    function deployProxy(
        address _masterCopy,
        bytes32 salt
    )
        internal
        returns (Proxy)
    {
        return new Proxy{salt: salt}(_masterCopy);
    }

    // TODO: discuss actual salt generation with team
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
                domainSalt,
                chainId(),
                initiator,
                responder
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
