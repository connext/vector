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

/// @title Channel Factory - Allows us to create new channel proxy contract
contract ChannelManager is IChannelManager {

    using LibChannelCrypto for bytes32;
    using SafeMath for uint256;

    IVectorChannel public immutable masterCopy;

    bytes32 private constant domainSalt = keccak256("vector");
    bytes public constant override proxyCreationCode = type(Proxy).creationCode;

    constructor(IVectorChannel _masterCopy) {
        masterCopy = _masterCopy;
    }

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
                byte(0xff), address(this), salt, initCodeHash
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
                "ChannelFactory: token transferFrom failed"
            );
            require(
                IERC20(assetId).approve(address(channel), amount),
                "ChannelFactory: token approve failed"
            );

        }

        channel.depositA{value: msg.value}(assetId, amount);
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


    struct Dispute { // Maybe this should be ChannelDispute?
        bytes32 channelStateHash;
        uint256 nonce;
        bytes32 merkleRoot;
        uint256 consensusExpiry;
        uint256 defundExpiry;
        // iterable_mapping(address => bool) assetDefunded; // Disabled because we now withdraw all assets
        bool isDefunded;
    }

    struct TransferDispute {
        uint256 transferDisputeExpiry;
        bytes32 transferStateHash;
        bool isDefunded;
    }

    mapping(address => Dispute) channelDispute;
    mapping(bytes32 => TransferDispute) transferDisputes;

    function forceChannelConsensus(
        CoreChannelState memory ccs,
        bytes[2] memory signatures
    )
        public
        override
        onlyParticipant(ccs)
    {
        // PSEUDOCODE: Please don't delete yet!
        // Dispute memory lastDispute = channelDispute(state.channelAddress)
        // validateSignatures(signatures, participants, state);
        // require(!inDefundPhase(lastDispute))
        // require(state.nonce >= lastDispute.nonce)
        // if (state.nonce == lastDispute.nonce) {
        //     require(!inConsensusPhase(lastDispute))
        //     channelDispute(state.channelAddress).consensusExpiry = block.number.add(state.timeout)
        //     channelDispute(state.channelAddress).defundExpiry    = block.number.add(state.timeout.mul(2))
        // } else { -- state.nonce > lastDispute.nonce
        //     Dispute dispute = {
        //         channelStateHash: hash(state),
        //         nonce: state.nonce,
        //         merkleRoot: state.merkleRoot,
        //         consensusExpiry: block.number.add(state.timeout)
        //         defundExpiry: block.number.add(state.timeout.mul(2))
        //         assetDefunded: empty mapping
        //      };
        //      channelDispute(state.channelAddress) = dispute;
        // }

        address channelAddress = getChannelAddress(ccs);
        Dispute storage dispute = channelDispute[channelAddress];

        verifySignatures(ccs.participants, ccs, signatures);

        require(
            !inDefundPhase(dispute),
            "Adjudicator forceChannelConsensus: Not allowed in defund phase"
        );

        // TODO: check not defunded???

        require(
            dispute.nonce <= ccs.nonce,
            "Adjudicator forceChannelConsensus: New nonce smaller than stored one"
        );

        if (dispute.nonce == ccs.nonce) {
            require(
                !inConsensusPhase(dispute),
                "Adjudicator forceChannelConsensus: Same nonce not allowed in consensus phase"
            );

        } else { // dispute.nonce < ccs.nonce
            dispute.channelStateHash = hashChannelState(ccs);
            dispute.nonce = ccs.nonce;
            dispute.merkleRoot = ccs.merkleRoot;
            // TODO: reset mapping
        }

        dispute.consensusExpiry = block.number.add(ccs.timeout); // TODO: offchain-ensure that there can't be an overflow
        dispute.defundExpiry = block.number.add(ccs.timeout.mul(2)); // TODO: offchain-ensure that there can't be an overflow

    }

    function defundChannel(
        CoreChannelState memory ccs
    )
        public
        override
        onlyParticipant(ccs)
    {
        // PSEUDOCODE: Please don't delete yet!
        // Dispute memory dispute = channelDispute(state.channelAddress)
        // require(inDefundPhase(dispute))
        // require(hash(state) == dispute.channelStateHash)

        // for(int i = 0, i < assetIds.length(), i++) {
        //      require(!dispute.assetDefunded[assetIds[i]])
        //      dispute.assetDefunded[assetIds[i]] = true

        //      VectorChannel channel = VectorChannel(state.channelAddress)
        //      LatestDeposit latestDeposit = channel.latestDepositA(assetIds[i])
        //
        //      Balance memory aBalance, bBalance; //Bad syntax here, I know
        //      aBalance.to = state.balA.to
        //      bBalance.to = state.balB.to

        //      if(latestDeposit.nonce < state.latestDepositNonce) {
        //          aBalance.amount = state.balA.add(latestDeposit.amount)
        //          bBalance.amount = channel.getBalance(assetIds[i]).sub((aBalance.add(state.lockedBalance[i]))) //TODO can we assume that assetIds[i] == lockedBalance[i]? probably not
        //      } else if (latestDeposit.nonce == state.latestDepositNonce) {
        //          aBalance.amount = state.balA;
        //          bBalance.amount = channel.getBalance(assetIds[i]).sub((aBalance.add(state.lockedBalance[i])))
        //      }
        //
        //      channel.adjudicatorTransfer([aBalance, bBalance], assetIds[i]);
        //  }

        address channelAddress = getChannelAddress(ccs);
        Dispute storage dispute = channelDispute[channelAddress];

        require(
            inDefundPhase(dispute),
            "Adjudicator defundChannel: Not in defund phase"
        );

        require(
            !dispute.isDefunded,
            "Adjudicator defundChannel: channel already defunded"
        );
        dispute.isDefunded = true;

        require(
            hashChannelState(ccs) == dispute.channelStateHash,
            "Adjudicator defundChannel: Hash of core channel state does not match stored hash"
        );

        // TODO SECURITY: Beware of reentrancy

        // TODO: keep this? offchain code has to ensure this
        assert(ccs.balances.length == ccs.lockedBalance.length && ccs.balances.length == ccs.assetIds.length);

        for (uint256 i = 0; i < ccs.balances.length; i++) {
            Balance memory balance = ccs.balances[i];
            uint256 lockedBalance = ccs.lockedBalance[i];
            address assetId = ccs.assetIds[i];

            IVectorChannel channel = IVectorChannel(channelAddress);
            LatestDeposit memory latestDeposit = channel.latestDepositByAssetId(assetId);

            Balance memory transfer;

            transfer.to[0] = balance.to[0];
            transfer.to[1] = balance.to[1];

            transfer.amount[0] = balance.amount[0];

            if (latestDeposit.nonce > ccs.latestDepositNonce) {
                transfer.amount[0] = transfer.amount[0].add(latestDeposit.amount);
            }

            transfer.amount[1] = channel.getBalance(assetId).sub(transfer.amount[0].add(lockedBalance));

            channel.managedTransfer(transfer, assetId);
        }
    }

    function forceTransferConsensus(
        CoreTransferState memory cts,
        bytes32[] memory merkleProofData
    )
        public
        override
        // TODO: Who should be able to call this?
    {
        // PSEUDOCODE: Please don't delete yet!
        // Dispute memory dispute = channelDispute(state.channelAddress)
        // require(inDefundPhase(dispute))
        // require(doMerkleProof(hash(state), dispute.merkleRoot, state.merkleProofData))
        // TransferDispute Memory transferDispute = transferDisputes(state.transferId)
        // require(!inTransferDispute(transferDispute) && !afterTransferDispute(transferDispute))
        // require(!transferDispute.isDefunded)

        // TransferDispute transferDispute = {
        //      transferDisputeExpiry: block.number.add(state.timeout)
        //      transferStateHash: hash(state)
        //      isDefunded: false
        // }
        //  transferDisputes(state.transferId) = transferDispute

        Dispute storage dispute = channelDispute[cts.channelAddress];

        require(
            inDefundPhase(dispute),
            "Adjudicator forceTransferConsensus: Not in defund phase"
        );

        bytes32 transferStateHash = hashTransferState(cts);

        verifyMerkleProof(transferStateHash, dispute.merkleRoot, merkleProofData);

        TransferDispute storage transferDispute = transferDisputes[cts.transferId];

        require(
            transferDispute.transferDisputeExpiry == 0,
            "Adjudicator forceTransferConsensus: transfer already disputed"
        );

        // necessary?
        require(
            !transferDispute.isDefunded,
            "Adjudicator forceTransferConsensus: transfer already defunded"
        );

        transferDispute.transferStateHash = transferStateHash;
        transferDispute.transferDisputeExpiry = block.number.add(cts.transferTimeout); // TODO: offchain-ensure that there can't be an overflow
    }

    function defundTransfer(
        CoreTransferState memory cts,
        bytes memory encodedInitialTransferState,
        bytes memory encodedTransferResolver
    )
        public
        override
        // TODO: Who should be able to call this?
    {
        // PSEUDOCODE: Please don't delete yet!
        // TransferDispute Memory transferDispute = transferDisputes(state.transferId)
        // require(hash(state) == transferDispute.transferStateHash)
        // require(inTransferDispute(transferDispute) || afterTransferDispute(transferDispute))

        // uint256[] finalBalances;

        // if(afterTransferDispute(transferDispute)) { -- empty it with created state
        //      finalBalances = state.balances
        // } else // inTransferDispute(transferDispute) {
        //      TransferState memory initialTransferState = abi.decode(encodedInitialTransferState, state.encodings[0])
        //
        //      require(hash(initialTransferState) == state.initialStateHash)
        //      TransferInterface transferInterface = TransferInterface(state.transferDefinition)
        //
        //      encodedResolvedBalances = transferInterface.resolve(encodedInitialTransferState, encodedTransferResolver)
        //      finalBalances = abi.decode(encodedResolvedBalances, Balances)
        // }
        //
        // transferDispute.isDefunded = true;
        // transferDisputes(state.transferId) = transferDispute

        // VectorChannel channel = VectorChannel(state.channelAddress)
        // channel.adjudicatorTransfer(finalBalances, state.assetId)

        TransferDispute memory transferDispute = transferDisputes[cts.transferId];

        require(
            hashTransferState(cts) == transferDispute.transferStateHash,
            "Adjudicator defundTransfer: Hash of core transfer state does not match stored hash"
        );

        // TODO: check / simplify
        require(
            transferDispute.transferDisputeExpiry != 0,
            "Adjudicator defundTransfer: transfer not yet disputed"
        );

        require(
            !transferDispute.isDefunded,
            "Adjudicator defundTransfer: transfer already defunded"
        );

        Balance memory finalBalance;

        if (block.number < transferDispute.transferDisputeExpiry) {
            require(
                keccak256(encodedInitialTransferState) == cts.initialStateHash,
                "Adjudicator defundTransfer: Hash of encoded initial transfer state does not match stored hash"
            );

            ITransferDefinition transferDefinition = ITransferDefinition(cts.transferDefinition);
            finalBalance = transferDefinition.resolve(encodedInitialTransferState, encodedTransferResolver);

        } else {
            finalBalance = cts.initialBalance;
        }

        IVectorChannel channel = IVectorChannel(cts.channelAddress);
        channel.managedTransfer(finalBalance, cts.assetId);
    }


    /* INTERNAL AND HELPER FUNCTIONS */

    modifier onlyParticipant(CoreChannelState memory ccs) {
        require(
            msg.sender == ccs.participants[0] ||
            msg.sender == ccs.participants[1],
            "Adjudicator: msg.sender is not channel participant"
        );
        _;
    }

    function getChannelAddress(CoreChannelState memory ccs) internal pure returns (address) {
        // TODO: FIX! SECURITY!
        // Must be derived from participants, chainId, channel nonce, etc.
        return ccs.channelAddress;
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
        require(participant == generatedHash.verifyChannelMessage(signature), "invalid signature on core channel state");
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
            "Adjudicator: Merkle proof verification failed"
        );
    }

    function inConsensusPhase(Dispute storage dispute) internal view returns (bool) {
        return block.number < dispute.consensusExpiry;
    }

    function inDefundPhase(Dispute storage dispute) internal view returns (bool) {
        return dispute.consensusExpiry <= block.number && block.number < dispute.defundExpiry;
    }

    function hashChannelState(CoreChannelState memory ccs) internal pure returns (bytes32) {
        // TODO WIP, check this!!
        bytes32 hashedState = sha256(abi.encode(ccs));
        return hashedState.toChannelSignedMessage();
    }

    function hashTransferState(CoreTransferState memory cts) internal pure returns (bytes32) {
        // TODO
        return sha256(abi.encode(cts));
    }

}
