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

/// @title Adjudicator - Dispute logic for ONE channel
contract Adjudicator is IAdjudicator {
    using LibChannelCrypto for bytes32;
    using SafeMath for uint256;

    ChannelDispute channelDispute;
    TransferDispute transferDispute;

    modifier onlyParticipant(CoreChannelState memory ccs) {
        require(
            msg.sender == ccs.participants[0] ||
            msg.sender == ccs.participants[1],
            "Adjudicator: msg.sender is not channel participant"
        );
        _;
    }

    // PSEUDOCODE: Please don't delete yet!
    // ChannelDispute memory lastDispute = channelDisputes(channelAddress)
    // validateSignatures(signatures, participants, state);
    // require(!inDefundPhase(lastDispute))
    // require(state.nonce >= lastDispute.nonce)
    // if (state.nonce == lastDispute.nonce) {
    //     require(!inConsensusPhase(lastDispute))
    //     channelDispute(channelAddress).consensusExpiry = block.number.add(state.timeout)
    //     channelDispute(channelAddress).defundExpiry = block.number.add(state.timeout.mul(2))
    // } else { -- state.nonce > lastDispute.nonce
    //     ChannelDispute channelDispute = {
    //         channelStateHash: hash(state),
    //         nonce: state.nonce,
    //         merkleRoot: state.merkleRoot,
    //         consensusExpiry: block.number.add(state.timeout)
    //         defundExpiry: block.number.add(state.timeout.mul(2))
    //         assetDefunded: empty mapping
    //      };
    // }
    function disputeChannel(
        CoreChannelState memory ccs,
        bytes[2] memory signatures
    )
        public
        override
        onlyParticipant(ccs)
    {
        verifySignatures(ccs.participants, ccs, signatures);
        require(
            !inDefundPhase(),
            "Adjudicator disputeChannel: Not allowed in defund phase"
        );
        require(
            channelDispute.nonce <= ccs.nonce,
            "Adjudicator disputeChannel: New nonce smaller than stored one"
        );
        if (channelDispute.nonce == ccs.nonce) {
            require(
                !inConsensusPhase(),
                "Adjudicator disputeChannel: Same nonce not allowed in consensus phase"
            );
        } else { // channelDispute.nonce < ccs.nonce
            channelDispute.channelStateHash = hashChannelState(ccs);
            channelDispute.nonce = ccs.nonce;
            channelDispute.merkleRoot = ccs.merkleRoot;
        }
        // TODO: offchain-ensure that there can't be an overflow
        channelDispute.consensusExpiry = block.number.add(ccs.timeout);
        channelDispute.defundExpiry = block.number.add(ccs.timeout.mul(2));
    }

    // PSEUDOCODE: Please don't delete yet!
    // require(inDefundPhase(channelDispute))
    // require(hash(state) == channelDispute.channelStateHash)
    // for(int i = 0, i < assetIds.length(), i++) {
    //      require(!channelDispute.assetDefunded[assetIds[i]])
    //      channelDispute.assetDefunded[assetIds[i]] = true
    //      ChannelMastercopy channel = ChannelMastercopy(channelAddress)
    //      LatestDeposit latestDeposit = channel.latestDepositA(assetIds[i])
    //
    //      Balance memory aBalance, bBalance; //Bad syntax here, I know
    //      aBalance.to = state.balA.to
    //      bBalance.to = state.balB.to
    //      if(latestDeposit.nonce < state.latestDepositNonce) {
    //          aBalance.amount = state.balA.add(latestDeposit.amount)
    //          // TODO can we assume that assetIds[i] == lockedBalance[i]? probably not
    //          bBalance.amount = channel.getBalance(assetIds[i]).sub((aBalance.add(state.lockedBalance[i])))
    //      } else if (latestDeposit.nonce == state.latestDepositNonce) {
    //          aBalance.amount = state.balA;
    //          bBalance.amount = channel.getBalance(assetIds[i]).sub((aBalance.add(state.lockedBalance[i])))
    //      }
    //
    //      channel.transfer([aBalance, bBalance], assetIds[i]);
    //  }
    function defundChannel(
        CoreChannelState memory ccs
    )
        public
        override
        onlyParticipant(ccs)
    {
        require(
            inDefundPhase(),
            "Adjudicator defundChannel: Not in defund phase"
        );
        require(
            !channelDispute.isDefunded,
            "Adjudicator defundChannel: channel already defunded"
        );
        channelDispute.isDefunded = true;
        require(
            hashChannelState(ccs) == channelDispute.channelStateHash,
            "Adjudicator defundChannel: Hash of core channel state does not match stored hash"
        );
        // TODO SECURITY: Beware of reentrancy
        // TODO: keep this? offchain code has to ensure this
        assert(ccs.balances.length == ccs.lockedBalance.length && ccs.balances.length == ccs.assetIds.length);
        for (uint256 i = 0; i < ccs.balances.length; i++) {
            Balance memory balance = ccs.balances[i];
            uint256 lockedBalance = ccs.lockedBalance[i];
            address assetId = ccs.assetIds[i];
            // TODO: something better
            IVectorChannel channel = IVectorChannel(address(this));
            LatestDeposit memory latestDeposit = channel.getLatestDeposit(assetId);
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

    // PSEUDOCODE: Please don't delete yet!
    // require(inDefundPhase(channelDispute))
    // require(doMerkleProof(hash(state), channelDispute.merkleRoot, state.merkleProofData))
    // require(!inTransferDispute(transferDispute) && !afterTransferDispute(transferDispute))
    // require(!transferDispute.isDefunded)
    // TransferDispute transferDispute = {
    //      transferDisputeExpiry: block.number.add(state.timeout)
    //      transferStateHash: hash(state)
    //      isDefunded: false
    // }
    function disputeTransfer(
        CoreTransferState memory cts,
        bytes32[] memory merkleProofData
    )
        public
        override
        // TODO: Who should be able to call this?
    {
        require(
            inDefundPhase(),
            "Adjudicator disputeTransfer: Not in defund phase"
        );
        bytes32 transferStateHash = hashTransferState(cts);
        verifyMerkleProof(transferStateHash, channelDispute.merkleRoot, merkleProofData);
        require(
            transferDispute.transferDisputeExpiry == 0,
            "Adjudicator disputeTransfer: transfer already disputed"
        );
        // necessary?
        require(
            !transferDispute.isDefunded,
            "Adjudicator disputeTransfer: transfer already defunded"
        );
        // TODO: offchain-ensure that there can't be an overflow
        transferDispute.transferStateHash = transferStateHash;
        transferDispute.transferDisputeExpiry = block.number.add(cts.transferTimeout);
    }

    // PSEUDOCODE: Please don't delete yet!
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
    // ChannelMastercopy channel = ChannelMastercopy(channelAddress)
    // channel.transfer(finalBalances, state.assetId)
    function defundTransfer(
        CoreTransferState memory cts,
        bytes memory encodedInitialTransferState,
        bytes memory encodedTransferResolver
    )
        public
        override
        // TODO: Who should be able to call this?
    {
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
            "Adjudicator: invalid signature on core channel state"
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
            "Adjudicator: Merkle proof verification failed"
        );
    }

    function inConsensusPhase() internal view returns (bool) {
        return block.number < channelDispute.consensusExpiry;
    }

    function inDefundPhase() internal view returns (bool) {
        return channelDispute.consensusExpiry <= block.number && block.number < channelDispute.defundExpiry;
    }

    function hashChannelState(CoreChannelState memory ccs) internal pure returns (bytes32) {
        // TODO: WIP
        bytes32 hashedState = keccak256(abi.encode(ccs));
        return hashedState.toChannelSignedMessage();
    }

    function hashTransferState(CoreTransferState memory cts) internal pure returns (bytes32) {
        // TODO: WIP
        return keccak256(abi.encode(cts));
    }

}
