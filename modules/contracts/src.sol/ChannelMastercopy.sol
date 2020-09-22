// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.7.1;
pragma experimental ABIEncoderV2;

import "./Adjudicator.sol";
import "./interfaces/IAdjudicator.sol";
import "./interfaces/IERC20.sol";
import "./interfaces/IVectorChannel.sol";
import "./lib/LibChannelCrypto.sol";
import "./lib/SafeMath.sol";


/// @title Vector Channel
/// @author Arjun Bhuptani <arjun@connext.network>
/// @notice
/// (a) A proxy to this contract is deployed per-channel using the ChannelFactory.sol contract
/// (b) Executes transactions dispute logic on a hardcoded channel factory
/// (c) Supports executing arbitrary CALLs when called w/ commitment that has 2 signatures

contract ChannelMastercopy is IVectorChannel, Adjudicator {
    using LibChannelCrypto for bytes32;
    using SafeMath for uint256;

    // masterCopy always needs to be first declared variable
    // This ensures that it is at the same location in the contracts to which calls are delegated.
    // To reduce deployment costs this variable is internal and needs to be retrieved via `getStorageAt`
    address internal masterCopy;

    IAdjudicator private _adjudicator;

    address[2] private _participants;

    mapping(bytes32 => bool) isExecuted;

    mapping(address => LatestDeposit) internal _latestDeposit;

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

    receive() external payable onlyByProxy {
        // TODO: emit Deposit event to track eth deposits
    }

    /// @notice Contract constructor for Mastercopy
    /// @notice The mastercopy is only a source of code & should never be used for real channels
    /// @notice To prevent anyone from using the mastercopy directly, initialize it w unusable data
    constructor() {
        _participants = [address(0),address(0)];
        _adjudicator = IAdjudicator(address(1));
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
        _adjudicator = IAdjudicator(adjudicator);
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

    function depositA(
        address assetId,
        uint256 amount
    )
        public
        payable
        override
        onlyByProxy
    {
        // WIP version just for basic testing
        if (assetId == address(0)) {
            require(msg.value == amount, "oh no");
        } else {
            require(IERC20(assetId).transferFrom(msg.sender, address(this), amount), "oh no");
        }
        _latestDeposit[assetId].amount = amount;
        _latestDeposit[assetId].nonce++;
    }

    // Workaround, because I was not able to convince the compiler
    // to let me override the getter in the interface with the
    // auto-generated getter of an overriding state variable
    // if said variable is a mapping with a struct as value type.
    // In other words, I had to write the getter myself...
    function getLatestDeposit(
        address assetId
    )
        public
        override
        view
        onlyByProxy
        returns (LatestDeposit memory)
    {
        return _latestDeposit[assetId];
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

    /// @notice Execute an n-of-n signed transaction specified by a (to, value, data, op) tuple
    /// This transaction is a message CALL
    /// @param to The destination address of the message call
    /// @param value The amount of ETH being forwarded in the message call
    /// @param data Any calldata being sent along with the message call
    /// @param nonce ???
    /// @param signatures A sorted bytes string of concatenated signatures of each owner
    function execTransaction(
        address to,
        uint256 value,
        bytes memory data,
        uint256 nonce,
        bytes[] memory signatures
    )
        public
        override
        onlyByProxy
    {
        bytes32 transactionHash = keccak256(
            abi.encodePacked(
                address(this),
                to,
                value,
                keccak256(data),
                nonce
            )
        );
        require(
            !isExecuted[transactionHash],
            "Transacation has already been executed"
        );
        isExecuted[transactionHash] = true;
        for (uint256 i = 0; i < _participants.length; i++) {
            require(
                _participants[i] == transactionHash.verifyChannelMessage(signatures[i]),
                "Invalid signature"
            );
        }
        execute(to, value, data);
    }

    /// @notice Execute a CALL on behalf of the multisignature wallet
    /// @notice This is largely used for withdrawing from the channel + migrations
    /// @return success A boolean indicating if the transaction was successful or not
    function execute(address to, uint256 value, bytes memory data)
        internal
        returns (bool success)
    {
        assembly {
            success := call(not(0), to, value, add(data, 0x20), mload(data), 0, 0)
        }
    }

}
