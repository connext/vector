// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.7.1;
pragma experimental ABIEncoderV2;

import "./interfaces/IChannelManager.sol";
import "./interfaces/IERC20.sol";
import "./interfaces/ITransferDefinition.sol";
import "./interfaces/IVectorChannel.sol";
import "./lib/LibChannelCrypto.sol";
import "./lib/MerkleProof.sol";
import "./lib/SafeMath.sol";
import "./Proxy.sol";

/// @title Channel Manager - Allows us to create new channel proxy contract
contract ChannelManager is IChannelManager {
    using LibChannelCrypto for bytes32;
    using SafeMath for uint256;

    IVectorChannel public immutable masterCopy;

    bytes32 private constant domainSalt = keccak256("vector");

    bytes public constant override proxyCreationCode = type(Proxy).creationCode;

    mapping(address => ChannelDispute) channelDispute;
    mapping(bytes32 => TransferDispute) transferDisputes;

    constructor(IVectorChannel _masterCopy) {
        masterCopy = _masterCopy;
    }

    modifier onlyParticipant(CoreChannelState memory ccs) {
        require(
            msg.sender == ccs.participants[0] ||
            msg.sender == ccs.participants[1],
            "ChannelManager: msg.sender is not channel participant"
        );
        _;
    }

    ////////////////////////////////////////
    // Public Methods

    /// @dev Allows us to get the address for a new channel contract created via `createChannel`
    /// @param initiator address of one of the two participants in the channel
    /// @param responder address of the other channel participant
    function getChannelAddress(
        address initiator,
        address responder
    )
        public
        override
        view
        returns (address)
    {
        bytes32 salt = generateSalt(initiator, responder);
        bytes32 initCodeHash = keccak256(abi.encodePacked(proxyCreationCode, masterCopy));
        return address(uint256(
            keccak256(abi.encodePacked(
                byte(0xff),
                address(this),
                salt,
                initCodeHash
            ))
        ));
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
        channel.setup([initiator, responder]);
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
                "ChannelManager: token transferFrom failed"
            );
            require(
                IERC20(assetId).approve(address(channel), amount),
                "ChannelManager: token approve failed"
            );
        }
        channel.depositA{value: msg.value}(assetId, amount);
    }

    ////////////////////////////////////////
    // Internal Methods

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
        Proxy proxy = new Proxy{salt: salt}(address(masterCopy));
        return IVectorChannel(address(proxy));
    }

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
                initiator,
                responder,
                chainId(),
                domainSalt
            )
        );
    }

    function chainId() internal pure returns (uint256 id) {
        // solium-disable-next-line security/no-inline-assembly
        assembly {
            id := chainid()
        }
    }

    function verifySignatures(
        address[2] memory participants,
        CoreChannelState memory ccs,
        bytes[2] memory signatures
    )
        internal
        pure
    {
        verifySignature(participants[0], ccs, signatures[0]);
        verifySignature(participants[1], ccs, signatures[1]);
    }

    function verifySignature(
        address participant,
        CoreChannelState memory ccs,
        bytes memory signature
    )
        internal
        pure
    {
        // TODO WIP, check this!!
        bytes32 generatedHash = hashChannelState(ccs);
        require(
            participant == generatedHash.verifyChannelMessage(signature),
            "invalid signature on core channel state"
        );
        return;
    }

    function verifyMerkleProof(
        bytes32 leaf,
        bytes32 root,
        bytes32[] memory proof
    )
        internal
        pure
    {
        require(
            MerkleProof.verify(proof, root, leaf),
            "ChannelManager: Merkle proof verification failed"
        );
    }

    function inConsensusPhase(ChannelDispute storage dispute) internal view returns (bool) {
        return block.number < dispute.consensusExpiry;
    }

    function inDefundPhase(ChannelDispute storage dispute) internal view returns (bool) {
        return dispute.consensusExpiry <= block.number && block.number < dispute.defundExpiry;
    }

    function hashChannelState(CoreChannelState memory ccs) internal pure returns (bytes32) {
        // TODO: WIP
        bytes32 hashedState = sha256(abi.encode(ccs));
        return hashedState.toChannelSignedMessage();
    }

    function hashTransferState(CoreTransferState memory cts) internal pure returns (bytes32) {
        // TODO: WIP
        return sha256(abi.encode(cts));
    }

}
