import { ChannelUpdate, FullChannelState, UpdateParams } from "./channel";
import {
  MAXIMUM_CHANNEL_TIMEOUT,
  MAXIMUM_TRANSFER_TIMEOUT,
  MINIMUM_CHANNEL_TIMEOUT,
  MINIMUM_TRANSFER_TIMEOUT,
} from "./constants";

export class Result<T, Y = any> {
  private value?: T;
  private error?: Y;

  public isError: boolean;

  private constructor(error?: Y, value?: T) {
    if (error) {
      this.isError = true;
      this.error = error;
    } else {
      this.isError = false;
      this.value = value;
    }
  }

  public getValue(): T {
    if (this.isError) {
      throw new Error(`Can't getValue() of error result: ${this.error}`);
    }
    return this.value as T;
  }

  public getError(): Y | undefined {
    if (this.isError) {
      return this.error as Y;
    }
    return undefined;
  }

  public static fail<U, Y extends Error>(error: Y): Result<U, Y> {
    return new Result<U, Y>(error);
  }

  public static ok<T>(result: T): Result<T> {
    return new Result<T>(undefined, result);
  }
}

export type Values<E> = E[keyof E];

// Abstract error for package
export abstract class VectorError extends Error {
  // These will define the subclasses of errors.
  static readonly errors = {
    OutboundChannelUpdateError: "OutboundChannelUpdateError",
    InboundChannelUpdateError: "InboundChannelUpdateError",
    ChainError: "ChainError",
    ValidationError: "ValidationError",
    RouterError: "RouterError",
    NodeError: "NodeError",
    LockError: "LockError",
    MessagingError: "MessagingError",
    // etc.
  } as const;

  abstract readonly type: Values<typeof VectorError.errors>;
  static readonly reasons: { [key: string]: string };

  constructor(
    public readonly message: Values<typeof VectorError.reasons>,
    // public readonly update?: ChannelUpdate<any> | (UpdateParams<any> & { nonce: number }),
    // public readonly state?: FullChannelState,
    public readonly context?: any,
  ) {
    super(message);
  }
}

export class ValidationError extends VectorError {
  readonly type = VectorError.errors.ValidationError;

  static readonly reasons = {
    AssetNotFound: "Asset is not found in channel",
    BadUpdateType: "Unrecognized update type",
    ChannelAlreadySetup: "Channel is already setup",
    ChannelNotFound: "No channel found in storage",
    DuplicateTransferId: "Transfer with matching transferId already stored",
    ExternalValidationFailed: "Failed external validation",
    ImproperlyReconciled: "Deposit was not properly reconciled",
    InDispute: "Channel currently in dispute",
    InsufficientFunds: "Insufficient funds in channel",
    InvalidArrayLength:
      "Channel array values have mismatching lengths (balances, assetIds, defundNonces, processedDepositsA/B)",
    InvalidAssetId: "Asset ID is invalid",
    InvalidChannelAddress: "Provided channel address is invalid",
    InvalidCounterparty: "Channel counterparty is invalid",
    InvalidFromIdentifier: "Update `fromIdentifier` is invalid",
    InvalidInitialState: "Initial transfer state is invalid",
    InvalidResolver: "Transfer resolver must be an object",
    InvalidTransferDefinition: "Transfer definition is incorrect",
    InvalidTransferEncodings: "Transfer encodings do not match regisry",
    InvalidToIdentifier: "Update `toIdentifier` is invalid",
    InvalidUpdateNonce: "Update nonce must be previousState.nonce + 1",
    LongChannelTimeout: `Channel timeout above maximum of ${MAXIMUM_CHANNEL_TIMEOUT.toString()}s`,
    MalformedDetails: "Channel update details are malformed",
    MalformedUpdate: "Channel update is malformed",
    MiscalculatedTransferId: "Calculated transfer ID is different than provided transferId",
    MiscalculatedChannelBalance: "Channel balance for update is miscalculated",
    MiscalculatedMerkleRoot: "Merkle root in update was miscalculated",
    MiscalculatedMerkleProof: "Merkle proof in update was miscalculated",
    NoActiveTransfers: "Active transfers are undefined",
    OnlyResponderCanInitiateResolve: "Only transfer responder may initiate resolve update",
    SetupTimeoutInvalid: "Provided state timeout is invalid",
    ShortChannelTimeout: `Channel timeout below minimum of ${MINIMUM_CHANNEL_TIMEOUT.toString()}s`,
    StoreFailure: "Failed to pull data from store",
    TransferNotActive: "Transfer not found in activeTransfers",
    TransferNotFound: "No transfer found in storage",
    TransferResolved: "Transfer has already been resolved",
    TransferTimeoutAboveChannel: `Transfer timeout must be less than the channel timeout`,
    TransferTimeoutBelowMin: `Transfer timeout above minimum of ${MINIMUM_TRANSFER_TIMEOUT.toString()}s`,
    TransferTimeoutAboveMax: `Transfer timeout below maximum of ${MAXIMUM_TRANSFER_TIMEOUT.toString()}s`,
    UnrecognizedType: "Unrecognized update type",
  } as const;

  constructor(
    public readonly message: Values<typeof OutboundChannelUpdateError.reasons>,
    public readonly params: UpdateParams<any> | ChannelUpdate<any>,
    public readonly state?: FullChannelState<any>,
    // eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
    public readonly context?: any,
  ) {
    super(message, context);
  }
}

// Thrown by the protocol when initiating an update
export class OutboundChannelUpdateError extends VectorError {
  readonly type = VectorError.errors.OutboundChannelUpdateError;

  static readonly reasons = {
    ...ValidationError.reasons,
    ApplyUpdateFailed: "Failed to apply update",
    BadSignatures: "Could not recover signers",
    CounterpartyFailure: "Counterparty failed to apply update",
    Create2Failed: "Failed to get create2 address",
    InvalidParams: "Invalid params",
    MessageFailed: "Failed to send message",
    OutboundValidationFailed: "Failed to validate incoming update",
    RestoreNeeded: "Channel too far out of sync, must be restored",
    RegenerateUpdateFailed: "Failed to regenerate update after sync",
    SaveChannelFailed: "Failed to save channel",
    StaleChannelNoUpdate: "Channel nonce is behind, no latest update from counterparty",
    StaleChannel: "Channel state is behind, cannot apply update",
    StoreFailure: "Failed to execute store method",
    SyncSingleSigned: "Counterparty gave single signed update to sync, refusing",
    SyncFailure: "Failed to sync channel from counterparty update",
    SyncValidationFailed: "Failed to validate update for sync",
    TransferNotFound: "No transfer found in storage",
    TransferNotActive: "Transfer not found in activeTransfers",
    TransferNotRegistered: "Transfer not found in registry",
  } as const;

  constructor(
    public readonly message: Values<typeof OutboundChannelUpdateError.reasons>,
    public readonly params: UpdateParams<any>,
    public readonly state?: FullChannelState<any>,
    // eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
    public readonly context?: any,
  ) {
    super(message, context);
  }
}

export class LockError extends VectorError {
  readonly type = VectorError.errors.LockError;

  static readonly reasons = {
    Unknown: "Unknown Lock Error //TODO",
  };
}

// Thrown by the protocol when applying an update
export class InboundChannelUpdateError extends VectorError {
  readonly type = VectorError.errors.InboundChannelUpdateError;

  static readonly reasons = {
    ...ValidationError.reasons,
    ApplyUpdateFailed: "Failed to apply update",
    BadSignatures: "Could not recover signers",
    DifferentIdentifiers: "Update changes channel publicIdentifiers",
    DifferentChannelAddress: "Update changes channelAddress",
    ExternalValidationFailed: "Failed to externally validate incoming update",
    InboundValidationFailed: "Failed to validate incoming update",
    InvalidAssetId: "Update `assetId` is invalid address",
    InvalidChannelAddress: "Update `channelAddress` is invalid",
    MergeUpdateFailed: "Failed to merge update",
    MessageFailed: "Failed to send message",
    RestoreNeeded: "Channel too far out of sync, must be restored",
    StaleChannel: "Channel state is behind, cannot apply update",
    StaleUpdate: "Update does not progress channel nonce",
    StaleChannelNoUpdate: "Channel nonce is behind, no latest update from counterparty",
    SaveChannelFailed: "Failed to save channel",
    StoreFailure: "Failed to execute store method",
    SyncSingleSigned: "Counterparty gave single signed update to sync, refusing",
    SyncFailure: "Failed to sync channel from counterparty update",
    TransferNotFound: "No transfer found in storage",
  } as const;

  constructor(
    public readonly message: Values<typeof InboundChannelUpdateError.reasons>,
    public readonly update: ChannelUpdate<any>,
    public readonly state?: FullChannelState<any>,
    public readonly context?: any,
  ) {
    super(message, context);
  }
}

export class NodeError extends VectorError {
  readonly type = VectorError.errors.NodeError;

  static readonly reasons = {
    ChannelNotFound: "Channel not found",
    InternalServerError: "Failed to send request",
    InvalidParams: "Request has invalid parameters",
    MultinodeProhibitted: "Not allowed to have multiple nodes",
    NoEvts: "No evts for event",
    NoPublicIdentifier: "Public identifier not supplied, and no default identifier",
    ProviderNotFound: "Provider not available for chain",
    Timeout: "Timeout",
    TransactionNotMined: "Failed to wait for transaction to be mined",
    TransferNotActive: "Transfer not found in channel active transfers",
    TransferNotFound: "Transfer not found",
  } as const;

  constructor(
    public readonly message: Values<typeof NodeError.reasons>,
    // eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
    public readonly context?: any,
  ) {
    super(message, context);
  }
}

export class MessagingError extends VectorError {
  readonly type = VectorError.errors.MessagingError;

  static readonly reasons = {
    Response: "Error received in response",
    Unknown: "Unknown messaging error",
  } as const;

  constructor(
    public readonly message: Values<typeof MessagingError.reasons>,
    // eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
    public readonly context?: any,
  ) {
    super(message, context);
  }
}
