import { VectorChannel } from "@connext/vector-contracts";
import {
  getSignerAddressFromPublicIdentifier,
  hashCoreTransferState,
  hashTransferState,
  getTransferNameFromState,
  hashChannelCommitment,
} from "@connext/vector-utils";
import { Contract, BigNumber, utils, constants } from "ethers";
import {
  UpdateType,
  ChannelUpdate,
  FullChannelState,
  UpdateParams,
  ChannelCommitmentData,
  Balance,
  IChannelSigner,
  CoreTransferState,
  IStoreService,
  TransferState,
} from "@connext/vector-types";

import { MerkleTree } from "./merkleTree";
import { resolve } from "./utils";
import { TransferState } from "../../types/dist/src";

// Should return a state with the given update applied
// It is assumed here that the update is validated before
// being passed in
export async function applyUpdate<T extends UpdateType>(
  update: ChannelUpdate<T>,
  state: FullChannelState<T>,
  transferState?: TransferState,
): Promise<FullChannelState<T>> {
  switch (update.type) {
    case UpdateType.setup: {
      const { timeout, networkContext } = (update as ChannelUpdate<"setup">).details;
      const publicIdentifiers = [update.fromIdentifier, update.toIdentifier];
      const participants: string[] = publicIdentifiers.map(getSignerAddressFromPublicIdentifier);
      return {
        nonce: 1,
        latestDepositNonce: 0,
        channelAddress: update.channelAddress,
        timeout,
        participants,
        balances: [],
        lockedValue: [],
        assetIds: [],
        merkleRoot: constants.HashZero,
        latestUpdate: undefined,
        networkContext,
        publicIdentifiers,
      };
    }
    case UpdateType.deposit: {
      // Generate the new balance field for the channel
      const { latestDepositNonce } = (update as ChannelUpdate<"deposit">).details;
      const balances = reconcileBalanceWithExisting(update.balance, update.assetId, state.balances, state.assetIds);
      return {
        ...state,
        balances,
        assetIds: !!state.assetIds.find((a) => a === update.assetId)
          ? state.assetIds
          : [...state.assetIds, update.assetId],
        nonce: update.nonce,
        latestDepositNonce,
      };
    }
    case UpdateType.create: {
      const { transferInitialState, merkleRoot } = (update as ChannelUpdate<"create">).details;
      // Generate the new balance field for the channel
      const balances = reconcileBalanceWithExisting(update.balance, update.assetId, state.balances, state.assetIds);
      const lockedValue = ;
      throw new Error("must reconcile locked value on transfer creation");
      // return {
      //   ...state,
      //   balances,
      //   lockedValue,
      //   nonce: update.nonce,
      //   merkleRoot,
      // };
    }
    case UpdateType.resolve: {
      const { transferId, merkleRoot } = (update as ChannelUpdate<"resolve">).details;
      const balances = reconcileBalanceWithExisting(update.balance, update.assetId, state.balances, state.assetIds);
      throw new Error("must reconcile locked value on transfer resolution");
      // return {
      //   ...state,
      //   balances,
      //   lockedValue,
      //   nonce: update.nonce,
      //   merkleRoot,
      // };
    }
    default: {
      throw new Error(`Unexpected UpdateType in received update: ${update.type}`);
    }
  }
}

// This function accepts user given parameters, generates
// a specific update based on the user input, validates the
// generated update, and signs it. To maximize code-reuse,
// all state/update validation should happen in the `validate`
// function, while all parameter validation should happen at
// the API level when the parameters first enter the system.

// It is also important to note that in all of these functions
// we will need to generate a signature for the state that
// would result if these updates are applied. That means that
// the `applyUpdate` function should be used to generate the
// properly validated resultant state
export async function generateUpdate<T extends UpdateType>(
  params: UpdateParams<T>,
  storeService: IStoreService,
  signer: IChannelSigner,
): Promise<ChannelUpdate<T>> {
  // Get the channel state
  const state = await storeService.getChannelState(params.channelAddress);

  // Only in the case of setup should the state be undefined
  if (!state && params.type !== UpdateType.setup) {
    throw new Error(`Could not find channel in store to update`);
  }

  // Create the update from user parameters based on type
  let unsigned: ChannelUpdate<any>;
  switch (params.type) {
    case UpdateType.setup: {
      unsigned = await generateSetupUpdate(params as UpdateParams<"setup">, signer);
      break;
    }
    case UpdateType.deposit: {
      unsigned = await generateDepositUpdate(state, params as UpdateParams<"deposit">, signer);
      break;
    }
    case UpdateType.create: {
      const transfers = await storeService.getActiveTransfers(params.channelAddress);
      unsigned = await generateCreateUpdate(state, params as UpdateParams<"create">, signer, transfers);
      break;
    }
    case UpdateType.resolve: {
      const transfers = await storeService.getActiveTransfers(params.channelAddress);
      const transferState = await storeService.getTransferState((params as UpdateParams<"resolve">).details.transferId);
      unsigned = await generateResolveUpdate(
        state,
        params as UpdateParams<"resolve">,
        signer,
        transfers,
        transferState,
      );
      break;
    }
    default: {
      throw new Error(`Unrecognized channel update type: ${params.type}`);
    }
  }

  // Create a signed commitment for the new state
  const newState = await applyUpdate(unsigned, state);
  const commitment = await generateSignedChannelCommitment(newState, signer);

  // Return the validated update to send to counterparty
  return {
    ...unsigned,
    signatures: commitment.signatures,
  };
}

async function generateSetupUpdate(
  params: UpdateParams<"setup">, // already validated
  signer: IChannelSigner,
): Promise<ChannelUpdate<"setup">> {
  // During channel creation, you have no channel state, so create
  // the base values
  const publicIdentifiers = [signer.publicIdentifier, params.details.counterpartyIdentifier];
  const participants: string[] = publicIdentifiers.map(getSignerAddressFromPublicIdentifier);

  // TODO: There may have to be a setup signature for the channel
  // when deploying the multisig. will need to generate that here
  // (check with heiko)

  // Create the channel update from the params
  // Don't use `generateBaseUpdate` for initial update
  const unsigned: ChannelUpdate<"setup"> = {
    nonce: 1,
    channelAddress: params.channelAddress,
    type: UpdateType.setup,
    fromIdentifier: signer.publicIdentifier,
    toIdentifier: params.details.counterpartyIdentifier,
    // should have the to field filled out
    balance: { to: participants, amount: ["0", "0"] },
    details: {
      networkContext: params.details.networkContext,
      timeout: params.details.timeout,
    },
    signatures: [],
    assetId: constants.AddressZero,
  };

  return unsigned;
}

// Generates deposit update from user input params.
async function generateDepositUpdate(
  state: FullChannelState,
  params: UpdateParams<"deposit">,
  signer: IChannelSigner,
): Promise<ChannelUpdate<"deposit">> {
  // The deposit update has the ability to change the values in
  // the following `FullChannelState` fields:
  // - balances
  // - assetIds
  // - nonce (general update helper)
  // - latestDepositNonce
  // while the remaining fields are consistent

  const { channelAddress } = state;

  // Initiating a deposit update should happen *after* money is
  // sent to the multisig. This means that the `latestDepositByAssetId`
  // will include the latest nonce needed

  // Determine the latest deposit nonce from chain using
  // the provided assetId from the params
  const multisig = new Contract(channelAddress, VectorChannel.abi, signer.provider);
  const deposits = await multisig.latestDepositByAssetId();
  const latestDepositNonce = deposits[params.details.assetId].nonce || 0;

  const balance = getUpdatedBalance("increment", params.details.assetId, params.details.amount, signer.address, state);

  const unsigned = {
    ...generateBaseUpdate(state, params, signer),
    balance,
    assetId: params.details.assetId,
    details: { latestDepositNonce },
    signatures: [],
  };

  return unsigned;
}

// Generates the transfer creation update based on user input
async function generateCreateUpdate(
  state: FullChannelState,
  params: UpdateParams<"create">,
  signer: IChannelSigner,
  transfers: CoreTransferState[],
): Promise<ChannelUpdate<"create">> {
  const {
    details: { assetId, transferDefinition, timeout, encodings, transferInitialState, amount },
  } = params;

  // Creating a transfer is able to effect the following fields
  // on the channel state:
  // - lockedValue
  // - balances
  // - nonce (all)
  // - merkle root

  // First, we must generate the merkle proof for the update
  // which means we must gather the list of open transfers for the channel
  // TODO: how to include the merkle proof in the hash?
  const coreTransferState: Omit<CoreTransferState, "merkleProofData"> = {
    assetId,
    // TODO: Should we pass in a transfer id?
    transferId: utils.hexlify(utils.randomBytes(32)),
    channelAddress: state.channelAddress,
    transferDefinition,
    transferEncodings: encodings,
    transferTimeout: timeout,
    initialStateHash: hashGenericTransferState(transferInitialState),
  };
  const transferHash = hashCoreTransferState(coreTransferState);
  const hashes = [...transfers.map((t) => t.initialStateHash), transferHash];
  const merkle = new MerkleTree(hashes);

  // Create the update from the user provided params
  const balance = getUpdatedBalance("decrement", assetId, amount, signer.address, state);
  const unsigned: ChannelUpdate<"create"> = {
    ...generateBaseUpdate(state, params, signer),
    balance,
    assetId,
    details: {
      transferId: coreTransferState.transferId,
      transferDefinition,
      transferTimeout: timeout,
      transferInitialState,
      transferEncodings: encodings,
      merkleProofData: merkle.proof(transferHash),
      merkleRoot: merkle.root,
    },
    signatures: [],
  };
  return unsigned;
}

// Generates resolve update from user input params
async function generateResolveUpdate(
  state: FullChannelState,
  params: UpdateParams<"resolve">,
  signer: IChannelSigner,
  transfers: CoreTransferState[],
  transfer: TransferState,
): Promise<ChannelUpdate<"resolve">> {
  // A transfer resolution update can effect the following
  // channel fields:
  // - balances
  // - lockedValue
  // - nonce
  // - merkle root

  // First generate latest merkle tree data
  const coreTransfer = transfers.find((x) => x.transferId === params.details.transferId);
  const hashes = transfers.filter((x) => x.transferId !== params.details.transferId).map((x) => x.initialStateHash);
  const merkle = new MerkleTree(hashes);

  // Get the new balance from contract
  const balance = await resolve(coreTransfer, transfer, params.details.transferResolver, signer);

  // Generate the unsigned update from the params
  const unsigned: ChannelUpdate<"resolve"> = {
    ...generateBaseUpdate(state, params, signer),
    balance,
    assetId: coreTransfer.assetId,
    details: {
      transferId: params.details.transferId,
      transferDefinition: coreTransfer.transferDefinition,
      transferResolver: params.details.transferResolver,
      transferEncodings: coreTransfer.transferEncodings,
      // TODO: do we need to pass around a proof here?
      merkleProofData: merkle.proof(coreTransfer.initialStateHash),
      merkleRoot: merkle.root,
    },
    signatures: [],
  };

  return unsigned;
}

// This function signs the state after the update is applied,
// not for the update that exists
async function generateSignedChannelCommitment(
  newState: FullChannelState,
  signer: IChannelSigner,
): Promise<ChannelCommitmentData> {
  const { publicIdentifiers, networkContext, ...core } = newState;
  const unsigned: ChannelCommitmentData = {
    chainId: networkContext.chainId,
    state: core,
    adjudicatorAddress: newState.networkContext.adjudicatorAddress,
    signatures: [],
  };
  const sig = await signer.signMessage(hashChannelCommitment(unsigned));
  const idx = publicIdentifiers.findIndex((p) => p === signer.publicIdentifier);
  return {
    ...unsigned,
    signatures: idx === 0 ? [sig, ""] : ["", sig],
    // TODO: see notes in ChannelUpdate type re: single-signed state
    // convention
  };
}

// TODO: signature assertion helpers for commitment data
// and for updates

// Holds the logic that is the same between all update types:
// - increasing channel nonce
// - defining update type
// - channel addressing (participants, address, etc.)
function generateBaseUpdate<T extends UpdateType>(
  state: FullChannelState | undefined,
  params: UpdateParams<T>,
  signer: IChannelSigner,
): Pick<ChannelUpdate<T>, "channelAddress" | "nonce" | "fromIdentifier" | "toIdentifier" | "type"> {
  // Create the update with all the things that are constant
  // between update types
  const publicIdentifiers = state.publicIdentifiers ?? [
    signer.publicIdentifier,
    (params as UpdateParams<"setup">).details.counterpartyIdentifier,
  ];
  return {
    nonce: (state.nonce ?? 0) + 1,
    channelAddress: state.channelAddress ?? params.channelAddress,
    type: params.type,
    fromIdentifier: signer.publicIdentifier,
    toIdentifier: publicIdentifiers.find((id) => id !== signer.publicIdentifier),
  };
}

// TODO: Remove this if we add a transfer type flag
// to create / resolve
function hashGenericTransferState(state: any): string {
  return hashTransferState(getTransferNameFromState(state), state);
}

function getUpdatedBalance(
  type: "increment" | "decrement",
  assetId: string,
  amount: string,
  initiator: string,
  state: FullChannelState,
): Balance {
  // Create a helper to manipulate a bignumber value to update based
  // on the balance update type
  const updateValue = (toUpdate) => {
    return type === "increment"
      ? BigNumber.from(toUpdate || 0)
          .add(amount)
          .toString()
      : BigNumber.from(toUpdate || 0)
          .sub(amount)
          .toString();
  };

  // Get the existing balances to update
  const assetIdx = state.assetIds.findIndex((a) => a === assetId);
  const existing = assetIdx === -1 ? ["0", "0"] : state.balances[assetIdx].amount;

  // Calculate the updated amount array (with proper
  // amount indexing)
  const updated =
    initiator === state.participants[0]
      ? [updateValue(existing[0]), existing[1]]
      : [existing[0], updateValue(existing[1])];

  return {
    to: state.participants,
    amount: updated,
  };
}

// Updates the existing state balances with the proposed balance
// from the update (generated from `getUpdatedBalance`)
function reconcileBalanceWithExisting(
  balanceToReconcile: Balance,
  assetToReconcile: string,
  existing: Balance[],
  assetIds: string[],
): Balance[] {
  // Update the balances array at the appropriate index
  const assetIdx = assetIds.findIndex((a) => a === assetToReconcile);
  if (assetIdx === -1) {
    // Add new balance to array (new asset id)
    return [...existing, balanceToReconcile];
  }

  // Otherwise, update the array at the given index
  const updated = [...existing];
  updated[assetIdx] = balanceToReconcile;
  return updated;
}
