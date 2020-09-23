// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.7.1;
pragma experimental ABIEncoderV2;

import "./interfaces/IAdjudicator.sol";
import "./interfaces/IERC20.sol";
import "./interfaces/ITransferDefinition.sol";
import "./interfaces/IVectorChannel.sol";
import "./lib/LibChannelCrypto.sol";
import "./lib/MerkleProof.sol";
import "./lib/SafeMath.sol";
import "./Proxy.sol";

/// @title Adjudicator - Dispute logic
contract Adjudicator is IAdjudicator {
    using LibChannelCrypto for bytes32;
    using SafeMath for uint256;

    mapping(address => ChannelDispute) channelDispute;
    mapping(bytes32 => TransferDispute) transferDisputes;

    modifier onlyParticipant(CoreChannelState memory ccs) {
        require(
            msg.sender == ccs.participants[0] ||
            msg.sender == ccs.participants[1],
            "ChannelFactory: msg.sender is not channel participant"
        );
        _;
    }

    function forceChannelConsensus(
        CoreChannelState memory ccs,
        bytes[2] memory signatures
    )
        public
        override
        onlyParticipant(ccs)
    {
        // PSEUDOCODE: Please don't delete yet!
        // ChannelDispute memory lastDispute = channelDisputes(state.channelAddress)
        // validateSignatures(signatures, participants, state);
        // require(!inDefundPhase(lastDispute))
        // require(state.nonce >= lastDispute.nonce)
        // if (state.nonce == lastDispute.nonce) {
        //     require(!inConsensusPhase(lastDispute))
        //     channelDispute(state.channelAddress).consensusExpiry = block.number.add(state.timeout)
        //     channelDispute(state.channelAddress).defundExpiry    = block.number.add(state.timeout.mul(2))
        // } else { -- state.nonce > lastDispute.nonce
        //     ChannelDispute dispute = {
        //         channelStateHash: hash(state),
        //         nonce: state.nonce,
        //         merkleRoot: state.merkleRoot,
        //         consensusExpiry: block.number.add(state.timeout)
        //         defundExpiry: block.number.add(state.timeout.mul(2))
        //         assetDefunded: empty mapping
        //      };
        //      channelDispute(state.channelAddress) = dispute;
        // }
        // TODO: what are the implications of this?
        address channelAddress = msg.sender; // getChannelAddress(ccs.participants[0], ccs.participants[1]);
        ChannelDispute storage dispute = channelDispute[channelAddress];
        verifySignatures(ccs.participants, ccs, signatures);
        require(
            !inDefundPhase(dispute),
            "ChannelFactory forceChannelConsensus: Not allowed in defund phase"
        );
        // TODO: check not defunded???
        require(
            dispute.nonce <= ccs.nonce,
            "ChannelFactory forceChannelConsensus: New nonce smaller than stored one"
        );
        if (dispute.nonce == ccs.nonce) {
            require(
                !inConsensusPhase(dispute),
                "ChannelFactory forceChannelConsensus: Same nonce not allowed in consensus phase"
            );
        } else { // dispute.nonce < ccs.nonce
            dispute.channelStateHash = hashChannelState(ccs);
            dispute.nonce = ccs.nonce;
            dispute.merkleRoot = ccs.merkleRoot;
            // TODO: reset mapping
        }
        // TODO: offchain-ensure that there can't be an overflow
        dispute.consensusExpiry = block.number.add(ccs.timeout);
        dispute.defundExpiry = block.number.add(ccs.timeout.mul(2));
    }

    function defundChannel(
        CoreChannelState memory ccs
    )
        public
        override
        onlyParticipant(ccs)
    {
        // PSEUDOCODE: Please don't delete yet!
        // ChannelDispute memory dispute = channelDispute(state.channelAddress)
        // require(inDefundPhase(dispute))
        // require(hash(state) == dispute.channelStateHash)
        // for(int i = 0, i < assetAddresss.length(), i++) {
        //      require(!dispute.assetDefunded[assetAddresss[i]])
        //      dispute.assetDefunded[assetAddresss[i]] = true
        //      ChannelMastercopy channel = ChannelMastercopy(state.channelAddress)
        //      LatestDeposit latestDeposit = channel.latestDepositA(assetAddresss[i])
        //
        //      Balance memory aBalance, bBalance; //Bad syntax here, I know
        //      aBalance.to = state.balA.to
        //      bBalance.to = state.balB.to
        //      if(latestDeposit.nonce < state.latestDepositNonce) {
        //          aBalance.amount = state.balA.add(latestDeposit.amount)
        //          // TODO can we assume that assetAddresss[i] == lockedBalance[i]? probably not
        //          bBalance.amount = channel.getBalance(assetAddresss[i]).sub((aBalance.add(state.lockedBalance[i])))
        //      } else if (latestDeposit.nonce == state.latestDepositNonce) {
        //          aBalance.amount = state.balA;
        //          bBalance.amount = channel.getBalance(assetAddresss[i]).sub((aBalance.add(state.lockedBalance[i])))
        //      }
        //
        //      channel.transfer([aBalance, bBalance], assetAddresss[i]);
        //  }
        // TODO: what are the implications of this?
        address channelAddress = msg.sender; // getChannelAddress(ccs.participants[0], ccs.participants[1]);
        ChannelDispute storage dispute = channelDispute[channelAddress];
        require(
            inDefundPhase(dispute),
            "ChannelFactory defundChannel: Not in defund phase"
        );
        require(
            !dispute.isDefunded,
            "ChannelFactory defundChannel: channel already defunded"
        );
        dispute.isDefunded = true;
        require(
            hashChannelState(ccs) == dispute.channelStateHash,
            "ChannelFactory defundChannel: Hash of core channel state does not match stored hash"
        );
        // TODO SECURITY: Beware of reentrancy
        // TODO: keep this? offchain code has to ensure this
        assert(ccs.balances.length == ccs.lockedBalance.length && ccs.balances.length == ccs.assetAddresss.length);
        for (uint256 i = 0; i < ccs.balances.length; i++) {
            Balance memory balance = ccs.balances[i];
            uint256 lockedBalance = ccs.lockedBalance[i];
            address assetAddress = ccs.assetAddresss[i];
            IVectorChannel channel = IVectorChannel(channelAddress);
            LatestDeposit memory latestDeposit = channel.latestDepositByAssetAddress(assetAddress);
            Balance memory transfer;
            transfer.to[0] = balance.to[0];
            transfer.to[1] = balance.to[1];
            transfer.amount[0] = balance.amount[0];
            if (latestDeposit.nonce > ccs.latestDepositNonce) {
                transfer.amount[0] = transfer.amount[0].add(latestDeposit.amount);
            }
            transfer.amount[1] = channel.getBalance(assetAddress).sub(transfer.amount[0].add(lockedBalance));
            channel.managedTransfer(transfer, assetAddress);
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
        // ChannelDispute memory dispute = channelDispute(state.channelAddress)
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
        ChannelDispute storage dispute = channelDispute[cts.channelAddress];
        require(
            inDefundPhase(dispute),
            "ChannelFactory forceTransferConsensus: Not in defund phase"
        );
        bytes32 transferStateHash = hashTransferState(cts);
        verifyMerkleProof(transferStateHash, dispute.merkleRoot, merkleProofData);
        TransferDispute storage transferDispute = transferDisputes[cts.transferId];
        require(
            transferDispute.transferDisputeExpiry == 0,
            "ChannelFactory forceTransferConsensus: transfer already disputed"
        );
        // necessary?
        require(
            !transferDispute.isDefunded,
            "ChannelFactory forceTransferConsensus: transfer already defunded"
        );
        // TODO: offchain-ensure that there can't be an overflow
        transferDispute.transferStateHash = transferStateHash;
        transferDispute.transferDisputeExpiry = block.number.add(cts.transferTimeout);
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
        //      encodedResolvedBalances = transferInterface.resolve(encodedInitialTransferState,encodedTransferResolver)
        //      finalBalances = abi.decode(encodedResolvedBalances, Balances)
        // }
        //
        // transferDispute.isDefunded = true;
        // transferDisputes(state.transferId) = transferDispute
        // ChannelMastercopy channel = ChannelMastercopy(state.channelAddress)
        // channel.transfer(finalBalances, state.assetAddress)
        TransferDispute memory transferDispute = transferDisputes[cts.transferId];
        require(
            hashTransferState(cts) == transferDispute.transferStateHash,
            "ChannelFactory defundTransfer: Hash of core transfer state does not match stored hash"
        );
        // TODO: check / simplify
        require(
            transferDispute.transferDisputeExpiry != 0,
            "ChannelFactory defundTransfer: transfer not yet disputed"
        );
        require(
            !transferDispute.isDefunded,
            "ChannelFactory defundTransfer: transfer already defunded"
        );
        Balance memory finalBalance;
        if (block.number < transferDispute.transferDisputeExpiry) {
            require(
                keccak256(encodedInitialTransferState) == cts.initialStateHash,
                "ChannelFactory defundTransfer: Hash of encoded initial transfer state does not match stored hash"
            );
            ITransferDefinition transferDefinition = ITransferDefinition(cts.transferDefinition);
            finalBalance = transferDefinition.resolve(encodedInitialTransferState, encodedTransferResolver);
        } else {
            finalBalance = cts.initialBalance;
        }
        IVectorChannel channel = IVectorChannel(cts.channelAddress);
        channel.managedTransfer(finalBalance, cts.assetAddress);
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
            "ChannelFactory: Merkle proof verification failed"
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
