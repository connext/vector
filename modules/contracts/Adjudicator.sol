// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.6.4;
pragma experimental ABIEncoderV2;

contract Adjudicator {
    
    function disputeChannel(

    ) public {
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

    function disputeTransfer() public {
        // TODO

        // It should check that the channel is the dispute period
        // It should check that the transferId hash is part of the merkle root of the checkpointed state
        // It should check whether the transfer is in the CREATED or RESOLVED state
        // If it is in the CREATED state, a timeout should be started within which the recipient may call the below `resolveTransfer()` function
            // TODO how do we get refunded funds out? Maybe a separate function to empty after the dispute?
        // Else if it is in the RESOLVED state, the finalized balance of the transfer should be immediately sent to the recipient
    }

    function resolveTransfer()
    public {
        // TODO --do we want this?

        // It should validate that the transfer of this transferId is in the CREATED state and within the resolve timeout period described above
        // It should take in params associated with the transfer and send them to the `transferDefinition` contract to calculate a valid state transition
        // It should take the finalized balances from this function and send them to the receiver
        // TODO this wont work as stated above -- we need it to be DELEGATECALLED from the multisig to have access to funds, but in this case there's no
    }

    // TODO this should probably be moved into a different contract
    function withdraw(

    )
        public
    {
        // First, validate params against signatures
        // If `happyCase` bool is true, then set balances for A and B to be equal to balances in state
        // Else
            // 1. Check passed in state state against latest checkpointed state -- should revert if post-checkpoint dispute timeout has expired or if channel is not in checkpoint period
            // 2. For each assetId passed in, do the below
            // 2. Check state.latestDepositA nonce  to see if it is less than the onchain deposit A nonce for that assetId
                // a. If so, set the node balance as equal to (state.balA + onchain deposit A balance) -- node do not include state.lockedBal
                //    and set user balance as equal to (onchain balance for that assetId - (state.balA + onchain deposit A balance))
                // b. Else, set the node balance as equal to state.balA and set user balance as equal to (onchain balance for that assetId - state.balA)
        // Then, for each assetId passed in, send balances
    }

}