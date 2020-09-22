// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.7.1;
pragma experimental ABIEncoderV2;

import "./interfaces/ICMCExecutor.sol";
import "./CMCCore.sol";
import "./lib/LibChannelCrypto.sol";


contract CMCExecutor is CMCCore, ICMCExecutor {

    using LibChannelCrypto for bytes32;

    mapping(bytes32 => bool) isExecuted;

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
