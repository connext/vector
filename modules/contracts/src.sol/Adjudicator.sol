// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.7.1;
pragma experimental ABIEncoderV2;

import "./interfaces/IAdjudicator.sol";


// Called directly by a VectorChannel.sol instance
contract Adjudicator is IAdjudicator {

    struct Dispute { // Maybe this should be ChannelDispute?
        bytes32 channelStateHash;
        uint256 nonce;
        bytes32 merkleRoot;
        uint256 consensusExpiry;
        uint256 defundExpiry;
        // iterable_mapping(address => bool) assetDefunded;
    }

    struct TransferDispute {
        uint256 transferDisputeExpiry;
        bytes32 transferStateHash;
        bool isDefunded;
    }

    mapping(address => Dispute) channelDispute;
    mapping(address => TransferDispute) transferDisputes;

    function forceChannelConsensus(
        CoreChannelState memory ccs,
        bytes[2] memory signatures
    )
        public
        override
        onlyParticipant(ccs)
    {
        // PSEUDOCODE:
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

        dispute.consensusExpiry = block.number + ccs.timeout; // TODO: offchain-ensure that there can't be an overflow
        dispute.defundExpiry = block.number + 2 * ccs.timeout; // TODO: offchain-ensure that there can't be an overflow

        // TODO: Can everybody who has the signatures do that, or should we restrict it to the participants?
    }

    function defundChannel(
        CoreChannelState memory ccs,
        address[] memory assetIds
    )
        public
        override
        onlyParticipant(ccs)
    {
        // PSEUDOCODE:
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
            hashChannelState(ccs) == dispute.channelStateHash,
            "Adjudicator defundChannel: Hash of core channel state does not match stored hash"
        );

        // TODO SECURITY: Beware of reentrancy
        for (uint256 i = 0; i < assetIds.length; i++) {
            // TODO:
            // 1. Require that asset has not already been defunded.
            // 2. Mark asset as defunded

            // ...
        }
    }

    function forceTransferConsensus(
        // Params
        // - CoreTransferState state
    )
        public
        override
        pure
    {
        // PSEUDOCODE:
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

        require(true, "oh no");
    }

    function defundTransfer(
        // Params
        // - CoreTransferState state
        // - bytes calldata encodedInitialTransferState
        // - bytes calldata encodedTransferResolver
    )
        public
        override
        pure
    {
        // PSEUDOCODE:
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

        require(true, "oh no");
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
        //TODO
        return;
    }

    function inConsensusPhase(Dispute storage dispute) internal view returns (bool) {
        return block.number < dispute.consensusExpiry;
    }

    function inDefundPhase(Dispute storage dispute) internal view returns (bool) {
        return dispute.consensusExpiry <= block.number && block.number < dispute.defundExpiry;
    }

    function hashChannelState(CoreChannelState memory ccs) internal pure returns (bytes32) {
        // TODO
        return 0;
    }

}
