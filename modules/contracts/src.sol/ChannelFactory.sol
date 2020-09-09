// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.7.1;

import "./Proxy.sol";
import "./interfaces/IChannelFactory.sol";


/// @title Channel Factory - Allows us to create new channel proxy contact
contract ChannelFactory is IChannelFactory {

    address mastercopy;
    string domainSalt = "vector";

    event ChannelCreation(address channel);

    constructor(address _mastercopy) {
        mastercopy = _mastercopy;
    }

    /// @dev Allows us to retrieve the runtime code of a deployed Proxy.
    /// @dev This can be used to check that the expected Proxy was deployed.
    function proxyRuntimeCode() public override pure returns (bytes memory) {
        return type(Proxy).runtimeCode;
    }

    /// @dev Allows us to retrieve the creation code used for the Proxy deployment.
    /// @dev With this it is easily possible to calculate predicted address.
    function proxyCreationCode() public override pure returns (bytes memory) {
        return type(Proxy).creationCode;
    }

    /// @dev Allows us to get the address for a new channel contact created via `createChannel`
    /// @dev When calling this method set `from` to the address of the channel factory.
    /// @param initiator address of one of the two participants in the channel
    /// @param responder address of the other channel participant
    function getChannelAddress(
        address initiator,
        address responder
    )
        public
        override
        returns (address channel)
    {
        channel = deployChannelProxy(initiator, responder);
        revert(string(abi.encodePacked(channel)));
    }

    /// @dev Allows us to create new channel contact and get it all set up in one transaction
    /// @param initiator address of one of the two participants in the channel
    /// @param responder address of the other channel participant
    function createChannel(
        address initiator,
        address responder
    )
        public
        override
        returns (address channel)
    {
        channel = deployChannelProxy(initiator, responder);
        // TODO: call channel.setup()? Do any other channel initialization chores?
        emit ChannelCreation(channel);
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
        returns (address channel)
    {
        // TODO: include chainId in the create2 salt
        bytes32 salt = keccak256(
            abi.encodePacked(initiator, responder, domainSalt)
        );

        bytes memory deploymentData = abi.encodePacked(
            type(Proxy).creationCode, uint256(mastercopy)
        );

        // solium-disable-next-line security/no-inline-assembly
        assembly {
            channel := create2(0x0, add(0x20, deploymentData), mload(deploymentData), salt)
            let codeSize := extcodesize(channel)
            if eq(codeSize, 0) { revert(0, 0) }
        }

        // TODO: finish deployment by calling setup([initiator, responder], adjudicatorAddress)
    }

}
