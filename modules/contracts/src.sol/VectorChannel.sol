// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.7.1;
pragma experimental ABIEncoderV2;

import "./shared/LibCommitment.sol";
import "./shared/LibChannelCrypto.sol";
import "./interfaces/IAdjudicator.sol";
import "./interfaces/IVectorChannel.sol";
import "./shared/IERC20.sol";


/// @title Vector Channel
/// @author Arjun Bhuptani <arjun@connext.network>
/// @notice
/// (a) A proxy to this contract is deployed per-channel using the ChannelFactory.sol contract
/// (b) Executes transactions dispute logic on a hardcoded Adjudicator.sol
/// (c) Supports executing arbitrary CALLs when called w/ commitment that has 2 signatures

contract VectorChannel is IVectorChannel {
    // Note: this is the mastercopy of channel logic, this address is managed by the ProxyFactory
    // TODO: decide which variables should be public

    using LibChannelCrypto for bytes32;

    address public masterCopy;

    mapping(bytes32 => bool) isExecuted;

    address[2] private _owners;

    IAdjudicator public _adjudicator;

    uint256 private adjudicatorNonce;

    // Workaround, because I was not able to convince the compiler
    // to let me override the getter in the interface with the
    // auto-generated getter of an overriding state variable
    // if said variable is a mapping with a struct as value type.
    // In other words, I had to write the getter myself...
    mapping(address => LatestDeposit) internal _latestDepositByAssetId;
    function latestDepositByAssetId(address assetId) public override view returns (LatestDeposit memory) {
        return _latestDepositByAssetId[assetId];
    }

    // TODO: receive must emit event, in order to track eth deposits
    receive() external payable {}

    modifier onlyAdjudicator {
        require(msg.sender == address(_adjudicator), "msg.sender is not the adjudicator");
        _;
    }

    /// @notice Contract constructor
    /// @param owners An array of unique addresses representing the participants of the channel
    /// @param adjudicator Address of associated Adjudicator that we can call to
    function setup(
        address[2] memory owners,
        IAdjudicator adjudicator
    )
        public
        override
    {
        require(address(_adjudicator) == address(0), "Contract has already been setup");
        _owners = owners;
        _adjudicator = adjudicator;
    }

    function getBalance(
        address assetId
    )
        public
        override
        view
        returns (uint256)
    {
        return assetId == address(0) ?
            address(this).balance :
            IERC20(assetId).balanceOf(address(this));
    }

    function depositA(
        address assetId,
        uint256 amount
        // bytes memory signature
    )
        public
        payable
        override
    {
        // TODO: Does this really need to validate signature against _owners[0]?
        //       Or can owners[0] just call this method directly?
        // This should save/upsert latestDepositByAssetId

        // TODO: current version just for basic testing

        if (assetId == address(0)) {
            require(msg.value == amount);
        } else {
            require(IERC20(assetId).transferFrom(msg.sender, address(this), amount));
        }

        _latestDepositByAssetId[assetId].amount = amount;
        _latestDepositByAssetId[assetId].nonce++;
    }

    // TODO gets called by the adjudicator contract in the event of a dispute to push out funds
    function adjudicatorTransfer(
        Balance memory balances,
        address assetId
    )
        public
        override
        onlyAdjudicator
        view
    {
        // TODO: replace w real logic
        require(balances.amount[0] > 0, "oh boy");
        require(assetId != address(0), "oh boy");
    }

    function updateAdjudicator(
        bytes[] memory signatures,
        uint256 nonce,
        IAdjudicator newAdjudicator
    )
        public
        override
    {
        require(
            nonce > adjudicatorNonce,
            "Already upgraded using this nonce"
        );
        require(
            signatures.length > 0,
            "More than 0 signatures must be provided"
        );

        // TODO validate signatures

        adjudicatorNonce = nonce;
        _adjudicator = newAdjudicator;
    }

  /// @notice Execute an n-of-n signed transaction specified by a (to, value, data, op) tuple
    /// This transaction is a message CALL
    /// @param to The destination address of the message call
    /// @param value The amount of ETH being forwarded in the message call
    /// @param data Any calldata being sent along with the message call
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
    {
        bytes32 transactionHash = getTransactionHash(
            to,
            value,
            data,
            nonce
        );
        require(
            !isExecuted[transactionHash],
            "Transacation has already been executed"
        );

        isExecuted[transactionHash] = true;

        for (uint256 i = 0; i < _owners.length; i++) {
            require(
                _owners[i] == transactionHash.verifyChannelMessage(signatures[i]),
                "Invalid signature"
            );
        }

        execute(
            to,
            value,
            data
        );
    }

    /// @notice Compute a unique transaction hash for a particular (to, value, data, op) tuple
    /// @return A unique hash that owners are expected to sign and submit to
    /// @notice Note that two transactions with identical values of (to, value, data, op)
    /// are not distinguished.
    function getTransactionHash(
        address to,
        uint256 value,
        bytes memory data,
        uint256 nonce
    )
        internal
        view
        returns (bytes32)
    {
        return keccak256(
            abi.encodePacked(
                address(this),
                to,
                value,
                keccak256(data),
                nonce
            )
        );
    }

    /// @notice A getter function for the owners of the multisig
    /// @return An array of addresses representing the owners
    function getOwners()
        public
        override
        view
        returns (address[2] memory)
    {
        return _owners;
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
