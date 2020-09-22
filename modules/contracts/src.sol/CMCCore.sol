// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.7.1;
pragma experimental ABIEncoderV2;

import "./interfaces/ICMCCore.sol";


contract CMCCore is ICMCCore {

    // masterCopy needs to be first declared variable
    // in order to ensure storage alignment with the proxy
    address public masterCopy;

    address[2] internal participants;

    // Prevents us from calling methods directly from the mastercopy contract
    modifier onlyOnProxy {
        require(
            masterCopy != address(0),
            "This contract is the mastercopy"
        );
        _;
    }

    /// @notice Contract constructor for Proxied copies
    /// @param _participants: A pair of addresses representing the participants of the channel
    function setup(
        address[2] memory _participants
    )
        external
        override
        onlyOnProxy
    {
        require(
            participants[0] == address(0) &&
            participants[1] == address(0),
            "Channel has already been setup"
        );
        participants = _participants;
    }

    /// @notice A getter function for the participants of the multisig
    /// @return An array of addresses representing the participants
    function getParticipants()
        external
        override
        view
        onlyOnProxy
        returns (address[2] memory)
    {
        return participants;
    }

}
