import { VectorChannel } from "@connext/vector-contracts";
import { ChannelSigner, getSignerAddressFromPublicIdentifier } from "@connext/vector-utils";
import { Contract, BigNumber, utils, constants } from "ethers";
import {
  UpdateType,
  ChannelUpdate,
  FullChannelState,
  UpdateParams,
  ChannelCommitmentData,
  Balance,
  LockedValueType,
  TransferState,
} from "@connext/vector-types";

import { validate } from "./validate";
import { MerkleTree } from "./merkleTree";

// Should return a validated state with the given update applied
export async function applyUpdate<T extends UpdateType>(
  // optional sig typings allows this fn to be used by initiator before signing
  update: ChannelUpdate<T>,
  state: FullChannelState<T>,
  transferInitialStates: TransferState[],
  providerUrl: string,
): Promise<FullChannelState<T>> {
  // TODO: May need store service and provider in validation function
  await validate(update, state, transferInitialStates, providerUrl);
  switch (update.type) {
    case UpdateType.setup: {
      // TODO: implement as if onchain first state is nonce 1
      return state;
    }
    case UpdateType.deposit: {
      // Generate the new balance field for the channel
      const balances = reconcileBalanceWithExisting(update.balance, update.assetId, state.balances, state.assetIds);
      return {
        ...state,
        balances,
        assetIds: !!state.assetIds.find((a) => a === update.assetId)
          ? state.assetIds
          : [...state.assetIds, update.assetId],
        nonce: update.nonce,
        latestDepositNonce: update.details.latestDepositNonce,
      };
    }
    case UpdateType.create: {
      // Generate the new balance field for the channel
      const balances = reconcileBalanceWithExisting(update.balance, update.assetId, state.balances, state.assetIds);
      const lockedValue = reconcileLockedValue(
        UpdateType.create,
        update.details.transferInitialState,
        state.assetIds,
        state.lockedValue,
      );
      return {
        ...state,
        balances,
        lockedValue,
        nonce: update.nonce,
        merkleRoot: update.details.merkleRoot,
      };
    }
    case UpdateType.resolve: {
      const balances = reconcileBalanceWithExisting(update.balance, update.assetId, state.balances, state.assetIds);
      const initialState = transferInitialStates.find((s) => s.transferId === update.details.transferId);
      if (!initialState) {
        throw new Error(`Could not find initial state for transfer to resolve. Id: ${update.details.transferId}`);
      }
      const lockedValue = reconcileLockedValue(UpdateType.resolve, initialState, state.assetIds, state.lockedValue);
      return {
        ...state,
        balances,
        lockedValue,
        nonce: update.nonce,
        merkleRoot: update.details.merkleRoot,
      };
    }
    default: {
      throw new Error(`Unrecognized update type: ${update.type}`);
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
  state: FullChannelState,
  transferInitialStates: TransferState[],
  // NOTE: this is a heavy database query but is required on every update
  // due to the general nature of the `validate` function.
  signer: ChannelSigner,
  providerUrl: string, // TODO: can this be derived from signer?
): Promise<ChannelUpdate<T>> {
  // Only in the case of setup should the state be undefined
  if (!state && params.type !== UpdateType.setup) {
    throw new Error(`Could not find channel in store to update`);
  }

  // Create the update from user parameters based on type
  let update: ChannelUpdate<any>;
  switch (params.type) {
    case UpdateType.setup: {
      update = await generateSetupUpdate(params as UpdateParams<"setup">, signer, providerUrl);
      break;
    }
    case UpdateType.deposit: {
      update = await generateDepositUpdate(state, params as UpdateParams<"deposit">, signer, transferInitialStates, providerUrl);
      break;
    }
    case UpdateType.create: {
      update = await generateCreateUpdate(state, params as UpdateParams<"create">, signer, transferInitialStates, providerUrl);
      break;
    }
    case UpdateType.resolve: {
      update = await generateResolveUpdate(state, params as UpdateParams<"resolve">, signer, transferInitialStates, providerUrl);
      break;
    }
    default: {
      throw new Error(`Unrecognized channel update type: ${params.type}`);
    }
  }

  // Return the validated update to send to counterparty
  return update;
}

async function generateSetupUpdate(
  params: UpdateParams<"setup">,
  signer: ChannelSigner,
  providerUrl: string,
): Promise<ChannelUpdate<"setup">> {
  // During channel creation, you have no channel state, so create
  // the base values
  const publicIdentifiers = [signer.publicIdentifier, params.details.counterpartyIdentifier];
  const participants = publicIdentifiers.map(getSignerAddressFromPublicIdentifier);
  const baseState: FullChannelState = {
    nonce: 0,
    latestDepositNonce: 0,
    channelAddress: params.channelAddress,
    timeout: params.details.timeout,
    participants,
    balances: [],
    lockedValue: [],
    assetIds: [],
    merkleRoot: constants.HashZero,
    latestUpdate: undefined,
    networkContext: params.details.networkContext,
    publicIdentifiers,
  };

  // TODO: There may have to be a setup signature for the channel
  // when deploying the multisig. will need to generate that here
  // (check with heiko)

  // Create the channel update from the params
  const unsigned: ChannelUpdate<"setup"> = {
    ...generateBaseUpdate(baseState, params, signer),
    // should have the to field filled out
    balance: { to: participants, amount: ["0", "0"] },
    details: {},
    signatures: [],
    assetId: constants.AddressZero,
  };
  // Create a signed commitment for the new state
  const newState = await applyUpdate(unsigned, baseState, [], providerUrl);
  const commitment = await generateSignedChannelCommitment(newState, signer);

  return {
    ...unsigned,
    signatures: commitment.signatures,
  };
}

// Generates deposit update from user input params.
async function generateDepositUpdate(
  state: FullChannelState,
  params: UpdateParams<"deposit">,
  signer: ChannelSigner,
  transferInitialStates: TransferState[],
  providerUrl: string,
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

  // Create a signed commitment for the new state
  const newState = await applyUpdate(unsigned, state, transferInitialStates, providerUrl);
  const commitment = await generateSignedChannelCommitment(newState, signer);

  return {
    ...unsigned,
    signatures: commitment.signatures,
  };
}

// Generates the transfer creation update based on user input
async function generateCreateUpdate(
  state: FullChannelState,
  params: UpdateParams<"create">,
  signer: ChannelSigner,
  transferInitialStates: TransferState[],
  providerUrl: string,
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
  const hashes = [...transferInitialStates, transferInitialState].map(hashTransferState);
  const merkle = new MerkleTree(hashes);

  // Create the update from the user provided params
  const balance = getUpdatedBalance("decrement", assetId, amount, signer.address, state);
  const unsigned: ChannelUpdate<"create"> = {
    ...generateBaseUpdate(state, params, signer),
    balance,
    assetId,
    details: {
      transferId: utils.hexlify(utils.randomBytes(32)),
      // TODO: Should we pass in a transfer id?
      transferDefinition,
      transferTimeout: timeout,
      transferInitialState,
      transferEncodings: encodings,
      merkleProofData: merkle.proof(hashTransferState(transferInitialState)),
      merkleRoot: merkle.root,
    },
    signatures: [],
  };

  // Create a signed commitment for the new state
  const newState = await applyUpdate(unsigned, state, transferInitialStates, providerUrl);
  const commitment = await generateSignedChannelCommitment(newState, signer);

  return {
    ...unsigned,
    signatures: commitment.signatures,
  };
}

// Generates resolve update from user input params
async function generateResolveUpdate(
  state: FullChannelState,
  params: UpdateParams<"resolve">,
  signer: ChannelSigner,
  transferInitialStates: TransferState[],
  providerUrl: string,
): Promise<ChannelUpdate<"resolve">> {
  // A transfer resolution update can effect the following
  // channel fields:
  // - balances
  // - lockedValue
  // - nonce
  // - merkle root

  // Grab the transfer from the store service to get the
  // asset id and other data
  // const stored = await storeService.getTransferState(params.details.transferId);
  // if (!stored) {
  //   throw new Error(`Cannot find stored transfer for id ${params.details.transferId}`);
  // }

  // First generate latest merkle tree data
  const hashes = transferInitialStates.filter((x) => x.transferId === params.details.transferId).map(hashTransferState);
  const initial = transferInitialStates.find((a) => a.transferId === params.details.transferId);
  const merkle = new MerkleTree(hashes);

  // Create the new balance
  const balance = getUpdatedBalance("increment", initial.assetId, initial.balance.amount[0], signer.address, state);

  // Generate the unsigned update from the params
  const unsigned: ChannelUpdate<"resolve"> = {
    ...generateBaseUpdate(state, params, signer),
    balance,
    assetId: initial.assetId,
    details: {
      transferId: params.details.transferId,
      transferDefinition: initial.transferDefinition,
      transferResolver: params.details.transferResolver,
      transferEncodings: initial.transferEncodings,
      // TODO: do we need to pass around a proof here?
      merkleProofData: merkle.proof(hashTransferState(initial)),
      merkleRoot: merkle.root,
    },
    signatures: [],
  };

  // Validate the generated update is correct, and create a
  // commitment for the new state
  const newState = await applyUpdate(unsigned, state, transferInitialStates, providerUrl);
  const commitment = await generateSignedChannelCommitment(newState, signer);
  return {
    ...unsigned,
    signatures: commitment.signatures,
  };
}

// This function signs the state after the update is applied,
// not for the update that exists
async function generateSignedChannelCommitment(
  newState: FullChannelState,
  signer: ChannelSigner,
): Promise<ChannelCommitmentData> {
  const { publicIdentifiers, networkContext, ...core } = newState;
  const unsigned: ChannelCommitmentData = {
    chainId: networkContext.chainId,
    state: core,
    adjudicatorAddress: newState.networkContext.adjudicatorAddress,
    signatures: [],
  };
  const sig = await signer.signMessage(hashCommitment(unsigned));
  const idx = publicIdentifiers.findIndex((p) => p === signer.publicIdentifier);
  return {
    ...unsigned,
    signatures: idx === 0 ? [sig, ""] : ["", sig],
    // TODO: see notes in ChannelUpdate type re: single-signed state
    // convention
  };
}

function hashCommitment(commitment: ChannelCommitmentData): string {
  throw new Error("hashCommitment not implemented");
}

// TODO: signature assertion helpers for commitment data
// and for updates

// Holds the logic that is the same between all update types:
// - increasing channel nonce
// - defining update type
// - channel addressing (participants, address, etc.)
function generateBaseUpdate<T extends UpdateType>(
  state: FullChannelState,
  params: UpdateParams<T>,
  signer: ChannelSigner,
): Pick<ChannelUpdate<T>, "channelAddress" | "nonce" | "fromIdentifier" | "toIdentifier" | "type"> {
  // Create the update with all the things that are constant
  // between update types
  return {
    nonce: state.nonce + 1,
    channelAddress: state.channelAddress,
    type: params.type,
    fromIdentifier: signer.publicIdentifier,
    toIdentifier: state.publicIdentifiers.find((s) => s !== signer.publicIdentifier),
  };
}

function hashTransferState(state: any): string {
  throw new Error("hashTransferState not implemented: " + state);
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

// Uses a balance generated from `getUpdatedBalance` to update the
// locked value during transfer creation/resolution
function reconcileLockedValue(
  type: typeof UpdateType.create | typeof UpdateType.resolve,
  transferInitialState: TransferState,
  assetIds: string[],
  lockedValue: LockedValueType[],
): LockedValueType[] {
  // First find the appropriate index for the assetId
  const assetIdx = assetIds.findIndex((a) => a === transferInitialState.assetId);

  // Sanity-check that this is greater than -1 since these funds should
  // always existing within the channel
  if (assetIdx === -1) {
    throw new Error(`Could not find transfer asset in assetIds`);
  }

  // Get the transfer amount from the initial state
  const transferAmount = BigNumber.from(transferInitialState.balance.amount[0]);

  // Get the existing locked value entry
  const existing = { ...lockedValue[assetIdx] };
  const updatedAmt =
    type === UpdateType.create
      ? transferAmount.add(existing.amount)
      : BigNumber.from(existing.amount).sub(transferAmount);

  // Generate the new locked value object
  const updated = [...lockedValue];
  updated[assetIdx] = { amount: updatedAmt.toString() };
  return updated;
}
