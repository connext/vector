import { UpdateType, ChannelUpdate, FullChannelState, TransferState } from "@connext/vector-types";
import { utils } from "ethers";

import { logger } from "./utils";

const { getAddress } = utils;

// This function is used to validate any update before signing it into your
// state. This function may be called by functions that need to be ack-d
// or when you are initiating an update.

// Called from within the `applyUpdate` function

// NOTE: there is an argument that this should not be applied when
// generating an update, and only when ack-ing. I think doing that *could*
// lead to duplicate code, but we can always change it back
export async function validate<T extends UpdateType = any>(
  update: ChannelUpdate<T>,
  state: FullChannelState<T>,
  transferInitialStates: TransferState[],
  providerUrl: string,
): Promise<void> {
  // There is no need to validate items in the state since this will always
  // be a double signed state

  // First, validate all the common fields within the channel update
  const { channelAddress, fromIdentifier, toIdentifier, nonce, assetId } = update;

  // The channel address should not change from the state
  if (channelAddress !== state.channelAddress) {
    throw new Error(`Update has different channel address than state`);
  }

  // Channel address should be an address
  if (!isAddress(channelAddress)) {
    throw new Error(`Channel address is not valid address`);
  }

  // The identifiers should be the same
  if (JSON.stringify([fromIdentifier, toIdentifier].sort()) !== JSON.stringify(state.publicIdentifiers.sort())) {
    throw new Error(`Update has different identifiers than state`);
  }

  // The update nonce should be exactly one more than the state nonce
  if (nonce !== state.nonce + 1) {
    throw new Error(`Nonce does not advance state`);
  }

  // Make sure the assetId is a valid address
  if (!isAddress(assetId)) {
    throw new Error(`AssetId is not valid address`);
  }

  // TODO: Validate any signatures that exist
  // TODO: Must decide on a convention for representing single signed states
  // TODO: How to generate the commitment data to validate the signature
  // against? See note at top

  // Then break out into type-specific validation
  switch (update.type) {
    case UpdateType.setup: {
      return validateSetup(update as ChannelUpdate<"setup">, state as FullChannelState<"setup">);
    }
    case UpdateType.deposit: {
      return validateDeposit(update as ChannelUpdate<"deposit">, state as FullChannelState<"deposit">);
    }
    case UpdateType.create: {
      return validateCreate(update as ChannelUpdate<"create">, state as FullChannelState<"create">);
    }
    case UpdateType.resolve: {
      return validateResolve(update as ChannelUpdate<"resolve">, state as FullChannelState<"resolve">);
    }
    default: {
      throw new Error(`Unexpected UpdateType in received update: ${update.type}`);
    }
  }
}

// NOTE: all the below helpers should validate the `details` field
// of the specific update. See the `ChannelUpdateDetailsMap` type

function validateSetup(update: ChannelUpdate<"setup">, state: FullChannelState<"setup">): void {
  // Validate channel doesnt exist in storage

  // Validate it is the correct channel address

  // Validate public identifiers are correctly formatted and the
  // participants are correctly derived

  // Validate network context has correct addresses
  // TODO: validate adjudicator onchain

  // Validate timeout is reasonable

  // Validate balances and locked value is 0

  // Validate initial nonce + latestDepositNonce
  // TODO: is initial nonce 0 or 1?

  // Validate merkle root is empty hash, assetIds are empty
  logger.error("validateSetup not implemented", { update, state });
}

function validateDeposit(update: ChannelUpdate<"deposit">, state: FullChannelState<"deposit">): void {
  // Validate the latest deposit nonce from chain

  // TODO: Best way to reconcile on and offchain balances?
  // Should we check the state balances + lockedVal + update.amount
  // === currentMultisigBalance?
  logger.error("validateDeposit not implemented", { update, state });
}

function validateCreate(update: ChannelUpdate<"create">, state: FullChannelState<"create">): void {
  // Validate transfer id

  // Validate transfer definition

  // Validate reasonable timeout

  // Validate tranfer initial state
  // TODO: this will require a provider!

  // Validate transfer encodings are correct
  // TODO: can we get this from chain?

  // Validate merkle proof data

  // Recalculate + validate merkle root
  // TODO: this will require all transfer initial states!
  logger.error("validateCreate not implemented", { update, state });
}

function validateResolve(update: ChannelUpdate<"resolve">, state: FullChannelState<"resolve">): void {
  // Validate transfer id

  // Validate transfer definition

  // Validate resolver
  // TODO: define transfer types

  // Validate merkle proof data

  // Recalculate + validate merkle root
  // TODO: this will require all transfer initial states!
  logger.error("validateResolve not implemented", { update, state });
}

function isAddress(addr: any): boolean {
  if (!addr) return false;
  if (typeof addr !== "string") return false;
  try {
    getAddress(addr);
    return true;
  } catch (e) {
    return false;
  }
}
