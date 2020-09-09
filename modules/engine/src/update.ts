import {
  // ChannelCommitmentRaw,
  // ChannelStateDynamic,
  ChannelState,
  ChannelUpdate,
  CreateTransferParams,
  TransferState,
  UpdateParams,
  UpdateType,
} from "./types";

// eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types,@typescript-eslint/no-unused-vars
export async function generateUpdate(params: UpdateParams, storeService: any, onchainService: any, signer: any): Promise<ChannelUpdate<any>> {
    const state: ChannelState = await storeService.getChannelState();
    let update: ChannelUpdate<any>;

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

// eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types,@typescript-eslint/no-unused-vars
async function generateDepositUpdate(state: ChannelState, update: Partial<ChannelUpdate<any>>, onchainService: any, signer: any): Promise<ChannelUpdate<any>> {
  /*
  The update initiator's balance must be incremented by the deposit amount (calculating new balances for each party using onchain data as described in the Funding a Channel writeup). Note that this is per-assetId, so a new assetId may need to be added to the assetId array.
  The channel nonce must be updated by 1.
  The latestDepositNonce in state must be set to whatever is onchain for Alice.
  A new ChannelCommitment must be generated using the above and signed by both parties.
  Set this update to state.latestUpdate.
  */
  // 1. Figure out
  return state;
}

// eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types,@typescript-eslint/no-unused-vars
async function generateCreateUpdate(state: ChannelState, update: Partial<ChannelUpdate<any>>, params: CreateTransferParams, signer: any): Promise<ChannelUpdate<any>> {
  let transferState: TransferState;

  // TODO: replace these w real fns
  const signChannelMessage = (a: any, b: any): any => { console.log(a, b); }; 
  const getChannelCommitmentFromState = (a: any): any => { return a; };
  const calculateBalanceChangeForCreate = (a: any, b: any, c: any): any => { console.log(a, b, c); };
  const getMerkleRoot = (a: any, b: any): any => { console.log(a, b); };
  const calculateLockedValueChangesForCreate = (a: any, b: any): any => { console.log(a, b); };
  const getMerkleProofData = (): any => console.log();
  const hash = (a: any): any => a;
  const getTransferId = (): any => console.log();

  // First, create the new transfer state
  transferState.assetId = params.assetId;
  transferState.channelAddress = state.channelAddress;
  transferState.encodings = params.encodings;
  transferState.transferDefinition = params.transferDefinition;
  transferState.transferId = await getTransferId(); //TODO what goes into this?
  transferState.transferStateHash = await hash(state);
  transferState.transferTimeout = params.timeout;
  transferState.merkleProofData = await getMerkleProofData(); //TODO what goes into this?

  // Then create the new channel commitment
  const channelCommitmentRaw = {
      ...await getChannelCommitmentFromState(state),
      balances:  calculateBalanceChangeForCreate(state.balances, transferState, "initiator"),
      merkleRoot: getMerkleRoot(state.merkleRoot, transferState),
      lockedValue: calculateLockedValueChangesForCreate(state.lockedValue, transferState),
  };


  // Sign it
  const signature = await signChannelMessage(signer, channelCommitmentRaw);

  console.log(signature);
  // Now translate this into a ChannelUpdate<any> type
    
  return state;
}
