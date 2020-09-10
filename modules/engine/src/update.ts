import { VectorChannel } from "@connext/vector-contracts";
import { getSignerAddressFromPublicIdentifier } from "@connext/vector-utils";
import { Contract, BigNumber, utils, constants } from "ethers";
import {
  UpdateType,
  ChannelUpdate,
  FullChannelState,
  UpdateParams,
  IStoreService,
  ChannelCommitmentData,
  Balance,
  LockedValueType,
} from "@connext/vector-types";

import { validate } from "./validate";
import { MerkleTree } from "./merkleTree";

// Should return a validated state with the given update applied
export async function applyUpdate<T extends UpdateType>(
  // optional sig typings allows this fn to be used by initiator before signing
  update: ChannelUpdate<T>,
  state: FullChannelState<T>,
): Promise<FullChannelState<T>> {
  // TODO: May need store service and provider in validation function
  await validate(update, state);
  switch (update.type) {
    case UpdateType.setup: {
      // The initial state should be passed into the setup function
      // TODO: there may be some weirdness with 0 nonces, will have to
      // check what the nonce should be in the open state
      return state;
    }
    case UpdateType.deposit: {
      // Generate the new balance field for the channel
      const balances = reconcileBalanceWithExisting(update.balance, state.balances);
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
      const balances = reconcileBalanceWithExisting(update.balance, state.balances);
      const lockedValue = reconcileLockedValue(UpdateType.create, update.balance, state.balances, state.lockedValue);
      return {
        ...state,
        balances,
        lockedValue,
        nonce: update.nonce,
        merkleRoot: update.details.merkleRoot,
      };
    }
    case UpdateType.resolve: {
      const balances = reconcileBalanceWithExisting(update.balance, state.balances);
      const lockedValue = reconcileLockedValue(UpdateType.resolve, update.balance, state.balances, state.lockedValue);
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
  storeService: IStoreService,
  // eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types,@typescript-eslint/no-unused-vars
  signer: any,
): Promise<ChannelUpdate<T>> {
  const state = await storeService.getChannelState(params.channelAddress);

  // Only in the case of setup should the state be undefined
  if (!state && params.type !== UpdateType.setup) {
    throw new Error(`Could not find channel in store to update`);
  }

  // Create the update from user parameters based on type
  let update: ChannelUpdate<any>;
  switch (params.type) {
    case UpdateType.setup: {
      update = await generateSetupUpdate(params as UpdateParams<"setup">, signer);
      break;
    }
    case UpdateType.deposit: {
      update = await generateDepositUpdate(state, params as UpdateParams<"deposit">, signer);
      break;
    }
    case UpdateType.create: {
      update = await generateCreateUpdate(state, params as UpdateParams<"create">, signer, storeService);
      break;
    }
    case UpdateType.resolve: {
      update = await generateResolveUpdate(state, params as UpdateParams<"resolve">, signer, storeService);
      break;
    }
    default: {
      throw new Error(`Unrecognized channel update type: ${params.type}`);
    }
  }

  // Return the validated update to send to counterparty
  return update;
}

async function generateSetupUpdate(params: UpdateParams<"setup">, signer: any): Promise<ChannelUpdate<"setup">> {
  // During channel creation, you have no channel state, so create
  // the base values
  const publicIdentifiers = [signer.publicIdentifier, params.details.counterpartyIdentifier];
  const baseState: FullChannelState = {
    nonce: 0,
    latestDepositNonce: 0,
    channelAddress: params.channelAddress,
    timeout: params.details.timeout,
    participants: [
      /* TODO: ?? */
      // @rahul / @arjun -- when would it ever me anything
      // but the corresponding addresses from the pubId array
    ].map(getSignerAddressFromPublicIdentifier),
    balances: [],
    lockedValue: [],
    assetIds: [],
    merkleRoot: constants.HashZero,
    latestUpdate: undefined,
    networkContext: params.details.networkContext,
    publicIdentifiers,
  };

  // Create the channel update from the params
  const unsigned: ChannelUpdate<"setup"> = {
    ...generateBaseUpdate(baseState, params, signer),
    balance: { to: [], amount: [], assetId: constants.AddressZero },
    details: {},
    signatures: [],
    assetId: constants.AddressZero,
  };
  // Create a signed commitment for the new state
  const newState = await applyUpdate(unsigned, baseState);
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
  signer: any,
): Promise<ChannelUpdate<"deposit">> {
  // The deposit update has the ability to change the values in
  // the following `FullChannelState` fields:
  // - balances
  // - assetIds
  // - nonce (general update helper)
  // - latestDepositNonce
  // while the remaining fields are consistent

  const { channelAddress } = state;

  // Determine the latest deposit nonce from chain using
  // the provided assetId from the params
  const multisig = new Contract(channelAddress, VectorChannel.abi, signer.provider);
  const deposits = await multisig.latestDepositByAssetId();
  // TODO: when will this increase?
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
  const newState = await applyUpdate(unsigned, state);
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
  signer: any,
  storeService: IStoreService,
): Promise<ChannelUpdate<"create">> {
  const {
    details: { assetId, transferDefinition, timeout, encodings, transferInitialState, amount },
    channelAddress,
  } = params;

  // Creating a transfer is able to effect the following fields
  // on the channel state:
  // - lockedValue
  // - balances
  // - nonce (all)
  // - merkle root

  // First, we must generate the merkle proof for the update
  // which means we must gather the list of open transfers for the channel
  const transfers = await storeService.getTransferInitialStates(channelAddress);
  const hashes = [...transfers, transferInitialState].map(hashTransferState);
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
  const newState = await applyUpdate(unsigned, state);
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
  signer: any,
  storeService: IStoreService,
): Promise<ChannelUpdate<"resolve">> {
  // A transfer resolution update can effect the following
  // channel fields:
  // - balances
  // - lockedValue
  // - nonce
  // - merkle root

  // Grab the transfer from the store service to get the
  // asset id and other data
  const stored = await storeService.getTransferState(params.details.transferId);
  if (!stored) {
    throw new Error(`Cannot find stored transfer for id ${params.details.transferId}`);
  }

  // First generate latest merkle tree data
  const active = await storeService.getTransferInitialStates(params.channelAddress);
  const hashes = active.filter((x) => x.transferId === params.details.transferId).map(hashTransferState);
  const initial = active.find((a) => a.transferId === params.details.transferId);
  const merkle = new MerkleTree(hashes);

  // Create the new balance
  const balance = getUpdatedBalance("increment", stored.assetId, stored.transferAmount, signer.address, state);

  // Generate the unsigned update from the params
  const unsigned: ChannelUpdate<"resolve"> = {
    ...generateBaseUpdate(state, params, signer),
    balance,
    assetId: stored.assetId,
    details: {
      transferId: params.details.transferId,
      transferDefinition: stored.transferDefinition,
      transferResolver: params.details.transferResolver,
      transferEncodings: stored.transferEncodings,
      // TODO: do we need to pass around a proof here?
      merkleProofData: merkle.proof(hashTransferState(initial)),
      merkleRoot: merkle.root,
    },
    signatures: [],
  };

  // Validate the generated update is correct, and create a
  // commitment for the new state
  const newState = await applyUpdate(unsigned, state);
  const commitment = await generateSignedChannelCommitment(newState, signer);
  return {
    ...unsigned,
    signatures: commitment.signatures,
  };
}

// This function signs the state after the update is applied,
// not for the update that exists
// TODO: This should make use of the channel commitment class
async function generateSignedChannelCommitment(
  newState: FullChannelState,
  signer: any,
): Promise<ChannelCommitmentData> {
  const { publicIdentifiers, networkContext, ...core } = newState;
  const multisig = new Contract(newState.channelAddress, VectorChannel.abi, signer.provider);
  const unsigned = {
    chainId: networkContext.chainId,
    state: core,
    adjudicatorAddress: await multisig._adjudicatorAddress(),
  };
  const sig = await signer.signChannelCommitment(unsigned);
  const idx = publicIdentifiers.findIndex((p) => p === signer.publicIdentifier);
  return {
    ...unsigned,
    signatures: idx === 0 ? [sig, ""] : ["", sig],
    // TODO: see notes in ChannelUpdate type re: single-signed state
    // convention
  };
}

// Holds the logic that is the same between all update types:
// - increasing channel nonce
// - defining update type
// - channel addressing (participants, address, etc.)
function generateBaseUpdate<T extends UpdateType>(
  state: FullChannelState,
  params: UpdateParams<T>,
  signer: any,
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
  const existing = state.balances.find((b) => b.assetId === assetId);
  const updateValue = (toUpdate) => {
    return type === "increment" ? BigNumber.from(toUpdate || 0).add(amount) : BigNumber.from(toUpdate || 0).sub(amount);
  };
  // TODO: Verify `balance` field passed into update should include the
  // changed balances for *both* parties, not just the initiated delta.
  return {
    assetId,
    // TODO: always the same ordering or update dependent?
    to: existing.to || state.participants,
    amount:
      initiator === state.participants[0]
        ? [updateValue(existing.amount[0]).toString(), existing.amount[1] || "0"]
        : [existing.amount[0] || "0", updateValue(existing.amount[1]).toString()],
  };
}

// Updates the existing state balances with the proposed balance
// from the update (generated from `getUpdatedBalance`)
function reconcileBalanceWithExisting(toReconcile: Balance, existing: Balance[]): Balance[] {
  // Clone the exisitng array
  const updated = [...existing];
  const idx = existing.findIndex((b) => b.assetId === toReconcile.assetId);
  if (idx === -1) {
    // New assetId, add the balance to reconcile to the array
    updated.push(toReconcile);
  } else {
    // The `getUpdatedBalances` function should return the correct
    // final balance for this asset id, so insert into updated array
    updated[idx] === toReconcile;
  }
  return updated;
}

// Uses a balance generated from `getUpdatedBalance` to update the
// locked value during transfer creation/resolution
function reconcileLockedValue(
  type: typeof UpdateType.create | typeof UpdateType.resolve,
  toReconcile: Balance, // updated asset balance after update is applied
  storedBalance: Balance[],
  lockedValue: LockedValueType[],
): LockedValueType[] {
  // First, we must determine how much the transfer was for based on the
  // balance change from the update balance (balance for the asset after
  // the update was applied) and the stored balance
  const existing = storedBalance.find((b) => b.assetId === toReconcile.assetId);
  if (!existing) {
    throw new Error(`Could not find balance for transfer in stored balances`);
  }

  // The transfer amount is the difference betweeen `existing` and `toReconcile`
  // amounts. First find the appropriate index
  const idx = existing.amount.findIndex((a, idx) => a !== toReconcile.amount[idx]);

  // Then calculate the transfer amount
  const transferAmount = BigNumber.from(existing.amount[idx]).sub(toReconcile.amount[idx]).abs();

  // Update the locked value
  const updated = [...lockedValue];
  const lockedIdx = lockedValue.findIndex((v) => v.assetId === toReconcile.assetId);
  if (lockedIdx === -1 && type === UpdateType.resolve) {
    throw new Error(`Could not find locked value to update for resolving transfer`);
  }

  if (lockedIdx === -1) {
    // New transfer asset id, simply push transfer amount to locked
    // value array (can only be the case for create)
    const lockedBal: LockedValueType = {
      assetId: toReconcile.assetId,
      amount: transferAmount.toString(),
    };
    updated.push(lockedBal);
  } else {
    // Update the existing locked value entry for the given asset
    updated[lockedIdx] = {
      ...lockedValue[lockedIdx],
      amount: transferAmount.add(lockedValue[lockedIdx].amount).toString(),
    };
  }

  return updated;
}
