import { UpdateParams, ChannelUpdate, UpdateType, ChannelState, ChannelStateDynamic, ChannelCommitmentRaw, TransferState, CreateTransferParams } from "./types";

export async function generateUpdate(params: UpdateParams, storeService, onchainService, signer): Promise<ChannelUpdate> {
    const state: ChannelState = await storeService.getChannelState();
    let update: ChannelUpdate;

    // First, do the things that are constant to every update
    update.nonce = state.nonce + 1;
    update.channelAddress = state.channelAddress;
    update.type = params.type;
    update.counterpartyPublicIdentifier = this.counterpartyPublicIdentifier;

    switch (params.type) {
        case UpdateType.setup: {

        }

        case UpdateType.deposit: {

        }

        case UpdateType.create: {

        }

        case UpdateType.resolve: {

        }
        // Is there a case where updateType isn't one of these? I guess we can validate incoming params elsewhere
    }
    return update;
}

async function generateDepositUpdate(state: ChannelState, update: Partial<ChannelUpdate>, onchainService, signer): Promise<ChannelUpdate> {
    /*
    The update initiator's balance must be incremented by the deposit amount (calculating new balances for each party using onchain data as described in the Funding a Channel writeup). Note that this is per-assetId, so a new assetId may need to be added to the assetId array.
    The channel nonce must be updated by 1.
    The latestDepositNonce in state must be set to whatever is onchain for Alice.
    A new ChannelCommitment must be generated using the above and signed by both parties.
    Set this update to state.latestUpdate.
    */

    // 1. Figure out

}

async function generateCreateUpdate(state: ChannelState, update: Partial<ChannelUpdate>, params: CreateTransferParams, signer): Promise<ChannelUpdate> {
    let channelCommitmentRaw: ChannelCommitmentRaw;
    let transferState: TransferState;
    let signature: string;

    // First, create the new transfer state
    transferState.assetId = params.assetId;
    transferState.channelAddress = state.channelAddress;
    transferState.encodings = params.encodings;
    transferState.transferDefinition = params.transferDefinition;
    transferState.transferId = await getTransferId() //TODO what goes into this?
    transferState.transferStateHash = await hash(params.initialState)
    transferState.transferTimeout = params.timeout;
    transferState.merkleProofData = await getMerkleProofData() //TODO what goes into this?

    // Then create the new channel commitment
    channelCommitmentRaw = {
        ...await getChannelCommitmentFromState(state),
        balances:  calculateBalanceChangeForCreate(state.balances, transferState, "initiator"),
        merkleRoot: getMerkleRoot(state.merkleRoot, transferState),
        lockedValue: calculateLockedValueChangesForCreate(state.lockedValue, transferState)
    }

    // Sign it
    signature = await signChannelMessage(signer, channelCommitmentRaw);

    // Now translate this into a ChannelUpdate type
    
}