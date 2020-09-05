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
            // TODO This function should also check the store of this contract to see if a `resolved` balances is available for this transferId set by `setTransferResolution`
        // Else if it is in the RESOLVED state, the finalized balance of the transfer should be immediately sent to the recipient
    }

    function setTransferResolution()
    public {
        // It should call the transfer definition contract using the initial state + transfer update and then set that in a `resolution` mapping to be read by `disputeTransfer()`
    }


    function withdraw(

    )
        public
    {
        // First, validate params against signatures
        // If `happyCase` bool is true, then set balances for A and B to be equal to balances in state
        // TODO should the dispute case be broken out into another function?
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