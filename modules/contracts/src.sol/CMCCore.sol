// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.7.1;
pragma experimental ABIEncoderV2;

import "./interfaces/ICMCCore.sol";
import "./interfaces/ICMCAdjudicator.sol";
import "./interfaces/IERC20.sol";


contract CMCCore is ICMCCore {
    // masterCopy always needs to be first declared variable
    // This ensures that it is at the same location in the contracts to which calls are delegated.
    // To reduce deployment costs this variable is internal and needs to be retrieved via `getStorageAt`
    address internal masterCopy;

    ICMCAdjudicator private _adjudicator;

    address[2] internal _participants;

    // Prevents us from calling methods directly from the mastercopy contract
    modifier onlyByProxy {
        require(address(_adjudicator) != address(1), "This contract is the mastercopy");
        require(address(_adjudicator) != address(0), "Channel has not been setup");
        _;
    }

    modifier onlyAdjudicator {
        require(msg.sender == address(_adjudicator), "Message sender is not the Adjudicator");
        _;
    }

    modifier onlyParticipants {
        require(msg.sender == address(_adjudicator), "Message sender is not a participant");
        _;
    }

    ////////////////////////////////////////
    // Public Methods

    /// @notice Contract constructor for Mastercopy
    /// @notice The mastercopy is only a source of code & should never be used for real channels
    /// @notice To prevent anyone from using the mastercopy directly, initialize it w unusable data
    constructor() {
        _participants = [address(0),address(0)];
        _adjudicator = ICMCAdjudicator(address(1));
    }

    /// @notice Contract constructor for Proxied copies
    /// @param participants: A pair of addresses representing the participants of the channel
    /// @param adjudicator: Address to call for adjudication logic
    function setup(
        address[2] memory participants,
        address adjudicator
    )
        public
        override
    {
        require(address(_adjudicator) == address(0), "Channel has already been setup");
        _participants = participants;
        _adjudicator = ICMCAdjudicator(adjudicator);
    }

    /// @notice A getter function for the participants of the multisig
    /// @return An array of addresses representing the participants
    function getParticipants()
        public
        override
        view
        onlyByProxy
        returns (address[2] memory)
    {
        return _participants;
    }

    function getBalance(
        address assetId
    )
        public
        override
        view
        onlyByProxy
        returns (uint256)
    {
        return assetId == address(0) ?
            address(this).balance :
            IERC20(assetId).balanceOf(address(this));
    }

    function managedTransfer(
        Balance memory balances,
        address assetId
    )
        public
        override
        onlyByProxy
        onlyAdjudicator
    {
        // TODO: This is quick-and-dirty to allow for basic testing.
        // We should add dealing with non-standard-conforming tokens,
        // unexpected reverts, avoid reentrancy, etc.
        if (assetId == address(0)) {
            balances.to[0].transfer(balances.amount[0]);
            balances.to[1].transfer(balances.amount[1]);
        } else {
            require(IERC20(assetId).transfer(balances.to[0], balances.amount[0]), "oh no");
            require(IERC20(assetId).transfer(balances.to[1], balances.amount[1]), "oh no");
        }
    }

}
