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
  LockedValueType,
  CoreTransferState,
  IEngineStore,
  TransferState,
} from "@connext/vector-types";

import { MerkleTree } from "./merkleTree";
import { resolve } from "./utils";

// Should return a state with the given update applied
// It is assumed here that the update is validated before
// being passed in
export async function applyUpdate<T extends UpdateType>(
  update: ChannelUpdate<T>,
  state: FullChannelState<T>,
  storeService: IEngineStore,
  // Initial state of resolved transfer for calculating
  // updates to locked value needed from store
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
      const lockedValue = reconcileLockedValue(
        UpdateType.create,
        transferInitialState.balance,
        update.assetId,
        state.lockedValue,
        state.assetIds,
      );
      return {
        ...state,
        balances,
        lockedValue,
        nonce: update.nonce,
        merkleRoot,
      };
    }
    case UpdateType.resolve: {
      const { merkleRoot, transferId } = (update as ChannelUpdate<"resolve">).details;
      const transfer = await storeService.getTransferState(transferId);
      const balances = reconcileBalanceWithExisting(update.balance, update.assetId, state.balances, state.assetIds);
      const lockedValue = reconcileLockedValue(
        UpdateType.create,
        transfer.balance,
        update.assetId,
        state.lockedValue,
        state.assetIds,
      );
      return {
        ...state,
        balances,
        lockedValue,
        nonce: update.nonce,
        merkleRoot,
      };
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
  storeService: IEngineStore,
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
  const newState = await applyUpdate(unsigned, state, storeService);
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

  const depositBalance = {
    to: state.participants,
    amount: signer.address === state.participants[0] ? [params.details.amount, "0"] : ["0", params.details.amount],
  };
  const balance = getUpdatedChannelBalance(UpdateType.deposit, params.details.assetId, depositBalance, state);

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
    details: { assetId, transferDefinition, timeout, encodings, transferInitialState },
  } = params;

  // Creating a transfer is able to effect the following fields
  // on the channel state:
  // - lockedValue
  // - balances
  // - nonce (all)
  // - merkle root

  // First, we must generate the merkle proof for the update
  // which means we must gather the list of open transfers for the channel
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
  const balance = getUpdatedChannelBalance(UpdateType.create, assetId, transferInitialState.balance, state);
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

  // Get the final transfer balance from contract
  const transferBalance = await resolve(coreTransfer, transfer, params.details.transferResolver, signer);

  // Convert transfer balance to channel update balance
  const balance = getUpdatedChannelBalance(UpdateType.resolve, coreTransfer.assetId, transferBalance, state);

  // Generate the unsigned update from the params
  const unsigned: ChannelUpdate<"resolve"> = {
    ...generateBaseUpdate(state, params, signer),
    balance, // TODO: this is not
    assetId: coreTransfer.assetId,
    details: {
      transferId: params.details.transferId,
      transferDefinition: coreTransfer.transferDefinition,
      transferResolver: params.details.transferResolver,
      transferEncodings: coreTransfer.transferEncodings,
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

function hashGenericTransferState(state: any): string {
  return hashTransferState(getTransferNameFromState(state), state);
}

function getUpdatedChannelBalance(
  type: typeof UpdateType.create | typeof UpdateType.resolve | typeof UpdateType.deposit,
  assetId: string,
  balanceToReconcile: Balance,
  state: FullChannelState,
): Balance {
  // Get the existing balances to update
  const assetIdx = state.assetIds.findIndex((a) => a === assetId);
  if (assetIdx === -1 && type !== UpdateType.deposit) {
    throw new Error(`Asset id not found in channel ${assetId}`);
  }
  const existing = state.balances[assetIdx] || { to: state.participants, amount: ["0", "0"] };

  // Create a helper to update some existing balance amount
  // based on the transfer amount using the update type
  const updateExistingAmount = (existing: string, update: string): string => {
    return type === UpdateType.create
      ? BigNumber.from(existing).sub(update).toString()
      : BigNumber.from(existing).add(update).toString();
  };

  // NOTE: in the transfer.balance, there is no guarantee that the
  // `transfer.to` corresponds to the `channel.balances[assetIdx].to`
  // (i.e. an external withdrawal recipient)

  // Create an array holding the appropriate index in the transfer
  // balance.to for the existing balance.to
  const existingToIndexes = balanceToReconcile.to.map((addr) => existing.to.findIndex((a) => a === addr));

  // Create an updated amount
  const updatedAmount = existingToIndexes
    .map((existingIdx) => {
      if (existingIdx == -1) {
        // the balance.to value is not in the existing.to value,
        // so there is no corresponding channel balance update
        return undefined;
      }
      // balance.to is a channel participant, so update the
      // corresponding amount
      const balanceIdx = balanceToReconcile.to.findIndex((a) => a === existing.to[existingIdx]);
      return updateExistingAmount(existing.amount[existingIdx], balanceToReconcile.amount[balanceIdx]);
    })
    .filter((x) => !!x);

  // TODO: this calculation assumes ordering between the `to` in the
  // channel balance and transfer balance are the same, verify!
  return {
    to: [...existing.to], // Always use channel ordering for update
    amount: updatedAmount,
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

// NOTE: CANNOT use `update.balance` because there is a chance
// that the value locked during transfer creation is not added
// back into the channel, but still needs to be removed from
// the locked value (i.e. withdrawal)
function reconcileLockedValue(
  type: typeof UpdateType.create | typeof UpdateType.resolve,
  transferBalanceToReconcile: Balance, // From transferState.balance
  assetToReconcile: string,
  existingLocked: LockedValueType[],
  assetIds: string[],
): LockedValueType[] {
  // Get the assetId index
  const assetIdx = assetIds.findIndex((a) => a === assetToReconcile);
  if (assetIdx === -1) {
    throw new Error(`Cannot find asset ${assetToReconcile} in channel`);
  }

  // Get the appropriate locked value for the asset
  // The locked value array may have empty/undefined values
  const locked = existingLocked[assetIdx] ?? { amount: "0" };

  // Find the total amount locked in the transfer initial
  // state
  const transferLocked = BigNumber.from(transferBalanceToReconcile.amount[0]).add(transferBalanceToReconcile.amount[1]);

  // Update the locked value by the balance difference\
  // Locked values should increase during transfer creation
  // and decrease during resolution
  const updated = [...existingLocked];
  // If there is no value at updated[idx], make sure to add it
  if (!updated[assetIdx]) {
    updated[assetIdx] = { amount: "0" };
  }
  updated[assetIdx].amount =
    type === UpdateType.create
      ? BigNumber.from(locked.amount).add(transferLocked).toString()
      : BigNumber.from(locked.amount).sub(transferLocked).toString();

  return updated;
}
