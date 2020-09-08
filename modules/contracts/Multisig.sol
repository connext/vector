// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.6.4;
pragma experimental ABIEncoderV2;

import "../shared/LibCommitment.sol";
import "../shared/LibChannelCrypto.sol";


/// @title Multisig - A channel multisig
/// @author Arjun Bhuptani <arjun@connext.network>
/// @notice
/// (a) Is "owned" (and deployed?) by an Adjudicator.sol contract
/// (b) Executes transactions when called by Adjudicator.sol (without requiring any signatures)
/// (c) Supports executing arbitrary CALLs when called w/ commitment that has 2 signatures
contract Multisig is LibCommitment {

    using LibChannelCrypto for bytes32;

    mapping(bytes32 => bool) isExecuted;

    address[] private _owners;

    struct LatestDeposit {
        uint256 amount;
        uint256 nonce;
    };

    mapping(address => LatestDeposit) public latestDepositByAssetId;

    receive() external payable { }

    modifier onlyAdjudicator {
      require(msg.sender == /*TODO get adjudicator address here */);
      _;
   }

    /// @notice Contract constructor
    /// @param owners An array of unique addresses representing the multisig owners
    //TODO should this be onlyAdjudicator?
    function setup(address[] memory owners) public {
        require(_owners.length == 0, "Contract has been set up before");
        _owners = owners;
    }

    function depositA(
        uint256 amount,
        address assetId,
        bytes memory signature
    )
        public payable
    {
        // TODO
        // This should validate signature against _owners[0], then save/upsert latestDepositByAssetId
    }

    // TODO gets admin-called by the adjudicator contract in the event of a dispute to push out funds
    function adjudicatorTransfer(
        address[] to,
        uint256[] amount,
        address assetId
    ) public onlyAdjudicator {

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
        bytes[] memory signatures
    )
        public
    {
        bytes32 transactionHash = getTransactionHash(
            to,
            value,
            data,
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
            data,
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
        Operation operation
    )
        public
        view
        returns (bytes32)
    {
        return keccak256(
            abi.encodePacked(
                uint8(CommitmentTarget.MULTISIG),
                address(this),
                to,
                value,
                keccak256(data),
                uint8(operation)
            )
        );
    }

    /// @notice A getter function for the owners of the multisig
    /// @return An array of addresses representing the owners
    function getOwners()
        public
        view
        returns (address[] memory)
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
