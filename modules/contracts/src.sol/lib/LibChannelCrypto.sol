// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.7.1;
pragma experimental ABIEncoderV2;

import "@openzeppelin/contracts/cryptography/ECDSA.sol";
		
/// @author Connext <support@connext.network>		
/// @notice This library contains helpers for recovering signatures from a		
///         Vector commitments. Channels do not allow for arbitrary signing of		
///         messages to prevent misuse of private keys by injected providers,		
///         and instead only sign messages with a Vector channel prefix.
library LibChannelCrypto {
    function checkSignature(
        bytes32 hash,
        bytes memory signature,
        address allegedSigner
    ) internal pure returns (bool) {
        return recoverChannelMessageSigner(hash, signature) == allegedSigner;
    }

    function recoverChannelMessageSigner(bytes32 hash, bytes memory signature)
        internal
        pure
        returns (address)
    {
        bytes32 digest = toChannelSignedMessage(hash);
        return ECDSA.recover(digest, signature);
    }

    function toChannelSignedMessage(bytes32 hash)
        internal
        pure
        returns (bytes32)
    {
        // 32 is the length in bytes of hash,
        // enforced by the type signature above
        return
            keccak256(abi.encodePacked("\x15Vector Signed Message:\n32", hash));
    }

    function checkUtilitySignature(
        bytes32 hash,
        bytes memory signature,
        address allegedSigner
    ) internal pure returns (bool) {
        return recoverChannelMessageSigner(hash, signature) == allegedSigner;
    }

    function recoverUtilityMessageSigner(bytes32 hash, bytes memory signature)
        internal
        pure
        returns (address)
    {
        bytes32 digest = toUtilitySignedMessage(hash);
        return ECDSA.recover(digest, signature);
    }

    function toUtilitySignedMessage(bytes32 hash)
        internal
        pure
        returns (bytes32)
    {
        // 32 is the length in bytes of hash,
        // enforced by the type signature above
        return
            keccak256(abi.encodePacked("\x15Utility Signed Message:\n32", hash));
    }
}
