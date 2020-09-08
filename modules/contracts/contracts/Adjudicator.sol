// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.7.1;

// Called directly by a VectorChannel.sol instance
contract Adjudicator {

    struct Balance {
        uint256[] amount; 
        address[] to;
        //TODO should we just make assetId part of the Balance?
    }

    struct Dispute { // Maybe this should be ChannelDispute?
        bytes32 channelStateHash;
        uint256 nonce;
        bytes32 merkleRoot;
        uint256 consensusExpiry;
        uint256 defundExpiry;
        iterable_mapping(address => bool) assetDefunded;
    }

    struct TransferDispute {
        uint256 transferDisputeExpiry;
        bytes32 transferStateHash;
        bool isDefunded;
    }

    mapping(address => Dispute) channelDispute;
    mapping(address => TransferDispute) transferDisputes;

    struct CoreChannelState {
        Balance[] balances; // TODO index by assetId? // initiator, responder
        uint256[] lockedBalance; // Indexed by assetId -- should always be changed in lockstep with transfers
        address[] assetIds;
        // TODO: The channelAddress needs to be derived from the participants (and chainId, channel nonce, etc.); otherwise Alice and Bob can control someone else's channel...
        // Maybe we should really put the adjudication logic into the VectorChannel; then we don't need to compute the address onchain and, in general, don't need to
        // worry aboout the adjudicator releasing the wrong (i.e. someone else's) funds.?
        bytes32 channelAddress;
        address[] participants; // Signer keys -- does NOT have to be the same as balances.to[]
        uint256 timeout;
        uint256 nonce;
        uint256 latestDepositNonce;
        bytes32 merkleRoot;
    }

    struct CoreTransferState {
        address assetId;
        bytes32 channelId;
        bytes32 transferId;
        address transferDefinition;
        uint256 transferTimeout;
        bytes32 transferStateHash;
        bytes[] encodings; // Initial state, resolver state
        // TODO merkleProofData
    }

    function forceChannelConsensus(
        // Params
        // - CoreChannelState state
        // - bytes[] signatures
    ) public {
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
    }

    function defundChannel(
        // Params
        // - CoreChannelState state
        // - address[] assetIds
    ) public {
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
    }

    function forceTransferConsensus(
        // Params
        // - CoreTransferState state
    ) public {
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
    }

    function defundTransfer(
        // Params
        // - CoreTransferState state
        // - bytes calldata encodedInitialTransferState
        // - bytes calldata encodedTransferResolver
    ) public {
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
    }
}
