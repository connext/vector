// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.6.4;
pragma experimental ABIEncoderV2;

import "./MultisigData.sol";
// import "../../shared/libs/LibCommitment.sol";
// import "../../shared/libs/LibChannelCrypto.sol";


/// @title Multisig - A channel multisig
/// @author Arjun Bhuptani <arjun@connext.network>
/// @notice
/// (a) Executes arbitrary transactions using `DELEGATECALL`
/// (b) Requires n-of-n unanimous consent
/// (c) Does not use on-chain address for signature verification
/// (d) Uses hash-based instead of nonce-based replay protection
contract Multisig is MultisigData, LibCommitment {

    using LibChannelCrypto for bytes32;

    mapping(bytes32 => bool) isExecuted;

    address[] private _owners;

    receive() external payable { }

    /// @notice Contract constructor
    /// @param owners An array of unique addresses representing the multisig owners
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
        // This should validate signature against _owners[0], then save a deposited amount + latest deposit nonce to multisig data
    }

    /// @notice Execute an n-of-n signed transaction specified by a (to, data) tuple
    /// This transaction is a delegate call. The arguments `to`, `data` are passed
    /// as arguments to the DELEGATECALL.
    /// @param to The destination address of the message call
    /// @param value The amount of ETH being forwarded in the message call
    /// @param data Any calldata being sent along with the message call
    /// @param signatures A sorted bytes string of concatenated signatures of each owner
    function execTransaction(
        address to,
        bytes memory data,
        bytes[] memory signatures
    )
        public
    {
        bytes32 transactionHash = getTransactionHash(
            to,
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

        require(execute(to, data), "execute failed");
        execute(
            to,
            data,
        );
    }

    /// @notice Compute a unique transaction hash for a particular (to, value, data, op) tuple
    /// @return A unique hash that owners are expected to sign and submit to
    /// @notice Note that two transactions with identical values of (to, value, data, op)
    /// are not distinguished.
    function getTransactionHash(
        address to,
        bytes memory data,
    )
        public
        view
        returns (bytes32)
    {
        return keccak256(
            abi.encodePacked(
                address(this),
                to,
                keccak256(data),
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

    /// @notice Execute a DELEGATECALL on behalf of the multisignature wallet
    /// @return success A boolean indicating if the transaction was successful or not
    function execute(address to, bytes memory data)
        internal
        returns (bool success)
    {
        assembly {
            success := delegatecall(not(0), to, add(data, 0x20), mload(data), 0, 0)
        }
    }

}
