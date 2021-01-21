import {
  ChannelUpdate,
  FullChannelState,
  MAXIMUM_CHANNEL_TIMEOUT,
  MAXIMUM_TRANSFER_TIMEOUT,
  MINIMUM_CHANNEL_TIMEOUT,
  MINIMUM_TRANSFER_TIMEOUT,
  UpdateParams,
  Values,
  ProtocolError,
} from "@connext/vector-types";

export class ValidationError extends ProtocolError {
  static readonly type = "ValidationError";

  static readonly reasons = {
    AssetNotFound: "Asset is not found in channel",
    ChannelAlreadySetup: "Channel is already setup",
    ChannelNotFound: "No channel found in storage",
    ChainServiceFailure: "Failed to execute chain service method",
    DuplicateTransferId: "Transfer with matching transferId already stored",
    InDispute: "Channel currently in dispute",
    InsufficientFunds: "Insufficient funds in channel",
    InvalidArrayLength:
      "Channel array values have mismatching lengths (balances, assetIds, defundNonces, processedDepositsA/B)",
    InvalidAssetId: "Asset ID is invalid",
    InvalidChannelAddress: "Provided channel address is invalid",
    InvalidCounterparty: "Channel counterparty is invalid",
    InvalidInitialState: "Initial transfer state is invalid",
    InvalidResolver: "Transfer resolver must be an object",
    LongChannelTimeout: `Channel timeout above maximum of ${MAXIMUM_CHANNEL_TIMEOUT.toString()}s`,
    OnlyResponderCanInitiateResolve: "Only transfer responder may initiate resolve update",
    ShortChannelTimeout: `Channel timeout below minimum of ${MINIMUM_CHANNEL_TIMEOUT.toString()}s`,
    TooManyAssets: "20 or more assets already in channel state",
    TransferNotActive: "Transfer not found in activeTransfers",
    TransferResolved: "Transfer has already been resolved",
    TransferTimeoutAboveChannel: `Transfer timeout must be less than the channel timeout`,
    TransferTimeoutBelowMin: `Transfer timeout below minimum of ${MINIMUM_TRANSFER_TIMEOUT.toString()}s`,
    TransferTimeoutAboveMax: `Transfer timeout above maximum of ${MAXIMUM_TRANSFER_TIMEOUT.toString()}s`,
    UnrecognizedType: "Unrecognized update type",
  } as const;

  constructor(
    public readonly message: Values<typeof ValidationError.reasons>,
    params: UpdateParams<any> | ChannelUpdate<any>,
    state?: FullChannelState,
    context: any = {},
  ) {
    super(
      message,
      state,
      Object.keys(params).includes("fromIdentifier") ? (params as ChannelUpdate) : undefined,
      !Object.keys(params).includes("fromIdentifier") ? (params as UpdateParams<any>) : undefined,
      context,
      ValidationError.type,
    );
  }
}

// Thrown by the protocol when applying an update
export class InboundChannelUpdateError extends ProtocolError {
  static readonly type = "InboundChannelUpdateError";

  static readonly reasons = {
    ApplyAndValidateInboundFailed: "Failed to validate + apply incoming update",
    ApplyUpdateFailed: "Failed to apply update",
    BadSignatures: "Could not recover signers",
    CannotSyncSetup: "Cannot sync a setup update, must restore",
    CouldNotGetParams: "Could not generate params from update",
    CouldNotGetFinalBalance: "Could not retrieve resolved balance from chain",
    GenerateSignatureFailed: "Failed to generate channel signature",
    ExternalValidationFailed: "Failed external inbound validation",
    InvalidUpdateNonce: "Update nonce must be previousState.nonce + 1",
    MalformedDetails: "Channel update details are malformed",
    MalformedUpdate: "Channel update is malformed",
    RestoreNeeded: "Cannot sync channel from counterparty, must restore",
    SaveChannelFailed: "Failed to save channel",
    StoreFailure: "Failed to pull data from store",
    StaleChannel: "Channel state is behind, cannot apply update",
    StaleUpdate: "Update does not progress channel nonce",
    SyncFailure: "Failed to sync channel from counterparty update",
    TransferNotActive: "Transfer not found in activeTransfers",
  } as const;

  constructor(
    public readonly message: Values<typeof InboundChannelUpdateError.reasons>,
    update: ChannelUpdate<any>,
    state?: FullChannelState,
    context: any = {},
  ) {
    super(message, state, update, undefined, context, InboundChannelUpdateError.type);
  }
}

// Thrown by the protocol when initiating an update
export class OutboundChannelUpdateError extends ProtocolError {
  static readonly type = "OutboundChannelUpdateError";

  static readonly reasons = {
    AcquireLockFailed: "Failed to acquire lock",
    BadSignatures: "Could not recover signers",
    CannotSyncSetup: "Cannot sync a setup update, must restore",
    ChannelNotFound: "No channel found in storage",
    CounterpartyFailure: "Counterparty failed to apply update",
    CounterpartyOffline: "Message to counterparty timed out",
    Create2Failed: "Failed to get create2 address",
    ExternalValidationFailed: "Failed external outbound validation",
    GenerateUpdateFailed: "Failed to generate update",
    InvalidParams: "Invalid params",
    NoUpdateToSync: "No update provided from responder to sync from",
    OutboundValidationFailed: "Failed to validate outbound update",
    RegenerateUpdateFailed: "Failed to regenerate update after sync",
    ReleaseLockFailed: "Failed to release lock",
    RestoreNeeded: "Cannot sync channel from counterparty, must restore",
    SaveChannelFailed: "Failed to save channel",
    StaleChannel: "Channel state is behind, cannot apply update",
    StoreFailure: "Failed to pull data from store",
    SyncFailure: "Failed to sync channel from counterparty update",
  } as const;

  constructor(
    public readonly message: Values<typeof OutboundChannelUpdateError.reasons>,
    params: UpdateParams<any>,
    state?: FullChannelState,
    context: any = {},
  ) {
    super(message, state, undefined, params, context, OutboundChannelUpdateError.type);
  }
}

export class CreateUpdateError extends ProtocolError {
  static readonly type = "CreateUpdateError";

  static readonly reasons = {
    BadUpdateType: "Cannot generate unrecognized update type",
    CouldNotApplyUpdate: "Failed to apply update to generate sig",
    CouldNotSign: "Failed to sign updated channel hash",
    FailedToReconcileDeposit: "Could not reconcile deposit",
    FailedToResolveTransferOnchain: "Could not resolve transfer onchain",
    TransferNotActive: "Transfer not found in active transfers",
    TransferNotRegistered: "Transfer not found in registry",
  } as const;

  constructor(
    public readonly message: Values<typeof CreateUpdateError.reasons>,
    params?: UpdateParams<any>,
    state?: FullChannelState,
    context: any = {},
  ) {
    super(message, state, undefined, params, context, CreateUpdateError.type);
  }
}

export class ApplyUpdateError extends ProtocolError {
  static readonly type = "ApplyUpdateError";

  static readonly reasons = {
    BadUpdateType: "Cannot apply unrecognized update type",
    ChannelNotFound: "Channel not found",
    MissingFinalBalance: "Final balance not provided for applying resolve update",
    TransferNotActive: "Transfer not found in active transfers",
  } as const;

  constructor(
    public readonly message: Values<typeof ApplyUpdateError.reasons>,
    update?: ChannelUpdate,
    state?: FullChannelState,
    context: any = {},
  ) {
    super(message, state, update, undefined, context, ApplyUpdateError.type);
  }
}
