// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.7.1;
pragma experimental ABIEncoderV2;


contract Adjudicator {

    enum AppStatus {
        CREATED,
        RESOLVED
    }

    struct Balance {
        uint256 amount;
        address to;
    }

    // TODO, state seems large
    struct CoreChannelState {
        Balance[][] balances; // TODO index by assetId? // initiator, responder
        uint256[] lockedValue; // Indexed by assetId -- should always be changed in lockstep with transfers
        address[] assetIds;
        bytes32 channelId;
        address[] participants; // Signer keys -- does NOT have to be the same as balances.to[]
        uint256 timeout;
        uint256 nonce;
        uint256 latestDepositNonce;
        bytes32 merkleRoot;
    }

    struct CoreTransferState {
        Balance[] balances;
        address assetId;
        bytes32 transferId;
        address transferDefinition;
        uint256 transferTimeout;
        bytes32 appStateHash;
        AppStatus status; // either of CREATED or RESOLVED
        // TODO merkleProof
    }

    function forceChannelConsensus(
        // Params
        // - CoreChannelState
        // - signatures[]
    )
        public
    {
        require(true, "oh boy");
        // TODO

        // If the channel is not in the checkpoint OR dispute period,
            // it should take in latest state and start two timeouts:
                // The first one, `checkpointComplete` should finalize in X blocks
                // The second one, `disputeComplete` should finalize in 2X blocks
        // Else if the channel is in the dispute period, then revert
        // Else
            // It should validate that the newly provided state is greater than whatever exists in store
            // It should validate the signatures/params on the passe din state
            // It should hash the state and store it to the mapping from channelId to checkpointHash
    }

    function emptyChannel(
        // Params
        // - CoreChannelState
        // - assetIds[]?
    )
        public
    {
        require(true, "oh boy");
        // TODO should the dispute case be broken out into another function?
            // 1. Check passed in state state against latest checkpointed state -- should revert if post-checkpoint dispute timeout has expired or if channel is not in checkpoint period
            // 2. For each assetId passed in, do the below
            // 2. Check state.latestDepositA nonce  to see if it is less than the onchain deposit A nonce for that assetId
                // a. If so, set the node balance as equal to (state.balA + onchain deposit A balance) -- node do not include state.lockedBal
                //    and set user balance as equal to (onchain balance for that assetId - (state.balA + onchain deposit A balance))
                // b. Else, set the node balance as equal to state.balA and set user balance as equal to (onchain balance for that assetId - state.balA)
        // Then, for each assetId, call the Multisig.sol using channelId, passing in correct balances
    }

    function emptyTransfer(
        // Params
        // - CoreTransferState
        // - signatures[]
    )
        public
    {
        require(true, "oh boy");
        // TODO

        // It should check that the channel is the dispute period
        // It should check that the transferId hash is part of the merkle root of the checkpointed state
        // It should check whether the transfer is in the CREATED or RESOLVED state
        // If it is in the CREATED state, a timeout should be started within which the recipient may call the below `resolveTransfer()` function
            // TODO This function should also check the store of this contract to see if a `resolved` balances is available for this transferId set by `setTransferResolution`
        // Else if it is in the RESOLVED state, the finalized balance of the transfer should be immediately forwarded to the `Multisig.sol` to `adjudicatorTransfer()
    }

    function setTransferResolution(
        // Params
        // - CoreTransferState
        // - signatures[]
        // - TransferResolver
    )
        public
    {
        require(true, "oh boy");
        // It should call the transfer definition contract using the initial state + transfer update and then set that in a `resolution` mapping to be read by `emptyTransfer()`
    }
}
