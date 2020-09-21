import {
  UpdateType,
  ChannelUpdate,
  FullChannelState,
  IVectorStore,
  Result,
  IChannelSigner,
  UpdateParams,
  OutboundChannelUpdateError,
  InboundChannelUpdateError,
} from "@connext/vector-types";
import { utils } from "ethers";
import pino from "pino";

const { getAddress } = utils;

// This function performs all update *initiator* side validation
// and is called from within the `update.generateUpdate` function
// NOTE: The presence and proper validity of user API inputs has
// been performed before getting to this function (see the vector)
// class parameter validation
export async function validateParams<T extends UpdateType = any>(
  params: UpdateParams<T>,
  state: FullChannelState | undefined,
  storeService: IVectorStore,
  signer: IChannelSigner,
  logger: pino.BaseLogger = pino(),
): Promise<OutboundChannelUpdateError | undefined> {
  // Only in the case of setup should the state be undefined
  if (!state && params.type !== UpdateType.setup) {
    return new OutboundChannelUpdateError(OutboundChannelUpdateError.reasons.ChannelNotFound, params, state);
  }

  switch (params.type) {
    case UpdateType.setup: {
      // Make sure channel does not exist with counterparty
      break;
    }
    case UpdateType.deposit: {
      break;
    }
    case UpdateType.create: {
      // Make sure there are sufficient funds in channel to create
      // transfer

      // Make sure transfer state properly matches the encoding

      // Make sure timeout is reasonable
      // TODO: should this be enforced here?
      break;
    }
    case UpdateType.resolve: {
      // Should have an existing transfer
      // NOTE: same efficiency concerns apply here with transfers in addition
      // to channels

      // Make sure resolver is correctly formatted for transfer def
      break;
    }
    default: {
      throw new Error(`Unexpected UpdateType in received params: ${params.type}`);
    }
  }

  logger.error("validateParams not implemented");
  return Promise.resolve(undefined);
}

// This function performs all update *responder* side validation
// and is called from within the `sync.mergeUpdate` function
export async function validateUpdate<T extends UpdateType = any>(
  update: ChannelUpdate<T>,
  state: FullChannelState,
  logger: pino.BaseLogger = pino(),
): Promise<Result<void, InboundChannelUpdateError>> {
  // There is no need to validate items in the state since this will always
  // be a double signed state

  // First, validate all the common fields within the channel update
  const { channelAddress, fromIdentifier, toIdentifier, nonce, assetId } = update;

  // The channel address should not change from the state
  if (channelAddress !== state.channelAddress) {
    return Result.fail(
      new InboundChannelUpdateError(InboundChannelUpdateError.reasons.DifferentChannelAddress, update, state),
    );
  }

  // Channel address should be an address
  if (!isAddress(channelAddress)) {
    return Result.fail(
      new InboundChannelUpdateError(InboundChannelUpdateError.reasons.InvalidChannelAddress, update, state),
    );
  }

  // The identifiers should be the same
  if (JSON.stringify([fromIdentifier, toIdentifier].sort()) !== JSON.stringify([...state.publicIdentifiers].sort())) {
    return Result.fail(
      new InboundChannelUpdateError(InboundChannelUpdateError.reasons.DifferentIdentifiers, update, state),
    );
  }

  // The update nonce should be exactly one more than the state nonce
  if (nonce !== state.nonce + 1) {
    return Result.fail(new InboundChannelUpdateError(InboundChannelUpdateError.reasons.StaleChannel, update, state));
  }

  // Make sure the assetId is a valid address
  if (!isAddress(assetId)) {
    return Result.fail(new InboundChannelUpdateError(InboundChannelUpdateError.reasons.InvalidAssetId, update, state));
  }

  // TODO: Validate any signatures that exist
  // TODO: Must decide on a convention for representing single signed states
  // TODO: How to generate the commitment data to validate the signature
  // against? See note at top

  // Then break out into type-specific validation
  switch (update.type) {
    case UpdateType.setup: {
      return validateSetup(update as ChannelUpdate<"setup">, state as FullChannelState<"setup">, logger);
    }
    case UpdateType.deposit: {
      return validateDeposit(update as ChannelUpdate<"deposit">, state as FullChannelState<"deposit">, logger);
    }
    case UpdateType.create: {
      return validateCreate(update as ChannelUpdate<"create">, state as FullChannelState<"create">, logger);
    }
    case UpdateType.resolve: {
      return validateResolve(update as ChannelUpdate<"resolve">, state as FullChannelState<"resolve">, logger);
    }
    default: {
      throw new Error(`Unexpected UpdateType in received update: ${update.type}`);
    }
  }
}

// NOTE: all the below helpers should validate the `details` field
// of the specific update. See the `ChannelUpdateDetailsMap` type

function validateSetup(
  update: ChannelUpdate<"setup">,
  state: FullChannelState<"setup">,
  logger: pino.BaseLogger = pino(),
): Result<undefined, InboundChannelUpdateError> {
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
  return Result.ok(undefined);
}

function validateDeposit(
  update: ChannelUpdate<"deposit">,
  state: FullChannelState<"deposit">,
  logger: pino.BaseLogger = pino(),
): Result<undefined, InboundChannelUpdateError> {
  // Validate the latest deposit nonce from chain

  // TODO: Best way to reconcile on and offchain balances?
  // Should we check the state balances + lockedVal + update.amount
  // === currentMultisigBalance?
  logger.error("validateDeposit not implemented", { update, state });
  return Result.ok(undefined);
}

function validateCreate(
  update: ChannelUpdate<"create">,
  state: FullChannelState<"create">,
  logger: pino.BaseLogger = pino(),
): Result<undefined, InboundChannelUpdateError> {
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
  return Result.ok(undefined);
}

function validateResolve(
  update: ChannelUpdate<"resolve">,
  state: FullChannelState<"resolve">,
  logger: pino.BaseLogger = pino(),
): Result<undefined, InboundChannelUpdateError> {
  // Validate transfer id

  // Validate transfer definition

  // Validate resolver
  // TODO: define transfer types

  // Validate merkle proof data

  // Recalculate + validate merkle root
  // TODO: this will require all transfer initial states!
  logger.error("validateResolve not implemented", { update, state });
  return Result.ok(undefined);
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
