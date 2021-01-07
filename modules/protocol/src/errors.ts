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
  readonly type = "ValidationError";

  static readonly reasons = {
    AssetNotFound: "Asset is not found in channel",
    BadUpdateType: "Unrecognized update type",
    ChannelAlreadySetup: "Channel is already setup",
    ChannelNotFound: "No channel found in storage",
    ChainServiceFailure: "Failed to execute chain service method",
    DuplicateTransferId: "Transfer with matching transferId already stored",
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
    LongChannelTimeout: `Channel timeout above maximum of ${MAXIMUM_CHANNEL_TIMEOUT.toString()}s`,
    MiscalculatedTransferId: "Calculated transfer ID is different than provided transferId",
    MiscalculatedChannelBalance: "Channel balance for update is miscalculated",
    MiscalculatedMerkleRoot: "Merkle root in update was miscalculated",
    MiscalculatedMerkleProof: "Merkle proof in update was miscalculated",
    NoActiveTransfers: "Active transfers are undefined",
    OnlyResponderCanInitiateResolve: "Only transfer responder may initiate resolve update",
    SetupTimeoutInvalid: "Provided state timeout is invalid",
    ShortChannelTimeout: `Channel timeout below minimum of ${MINIMUM_CHANNEL_TIMEOUT.toString()}s`,
    TooManyAssets: "20 or more assets already in channel state",
    TransferNotActive: "Transfer not found in activeTransfers",
    TransferNotFound: "No transfer found in storage",
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
    );
  }
}

// Thrown by the protocol when applying an update
export class InboundChannelUpdateError extends ProtocolError {
  readonly type = "InboundChannelUpdateError";

  static readonly reasons = {
    ApplyAndValidateInboundFailed: "Failed to validate + apply incoming update",
    ApplyUpdateFailed: "Failed to apply update",
    BadSignatures: "Could not recover signers",
    CouldNotGetParams: "Could not generate params from update",
    CouldNotGetFinalBalance: "Could not retrieve resolved balance from chain",
    GenerateSignatureFailed: "Failed to generate channel signature",
    ExternalValidationFailed: "Failed external inbound validation",
    InvalidUpdateNonce: "Update nonce must be previousState.nonce + 1",
    MalformedDetails: "Channel update details are malformed",
    MalformedUpdate: "Channel update is malformed",
    MissingFinalBalance: "Final balance for resolve not found",
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
    super(message, state, update, undefined, context);
  }
}

// Thrown by the protocol when initiating an update
export class OutboundChannelUpdateError extends ProtocolError {
  readonly type = "OutboundChannelUpdateError";

  static readonly reasons = {
    AcquireLockFailed: "Failed to acquire lock",
    ApplyUpdateFailed: "Failed to apply update",
    BadSignatures: "Could not recover signers",
    ChannelNotFound: "No channel found in storage",
    CounterpartyFailure: "Counterparty failed to apply update",
    CounterpartyOffline: "Message to counterparty timed out",
    Create2Failed: "Failed to get create2 address",
    ExternalValidationFailed: "Failed external outbound validation",
    GenerateUpdateFailed: "Failed to generate update",
    InvalidParams: "Invalid params",
    OutboundValidationFailed: "Failed to validate outbound update",
    ReleaseLockFailed: "Failed to release lock",
    RegenerateUpdateFailed: "Failed to regenerate update after sync",
    SaveChannelFailed: "Failed to save channel",
    StaleChannel: "Channel state is behind, cannot apply update",
    StoreFailure: "Failed to pull data from store",
    SyncFailure: "Failed to sync channel from counterparty update",
    TransferNotRegistered: "Transfer not found in registry",
  } as const;

  constructor(
    public readonly message: Values<typeof OutboundChannelUpdateError.reasons>,
    params: UpdateParams<any>,
    state?: FullChannelState,
    context: any = {},
  ) {
    super(message, state, undefined, params, context);
  }
}

export class CreateUpdateError extends ProtocolError {
  readonly type = "CreateUpdateError";

  static readonly reasons = {
    BadUpdateType: "Cannot generate unrecognized update type",
    ChannelNotFound: "Channel not found",
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
    super(message, state, undefined, params, context);
  }
}

export class ApplyUpdateError extends ProtocolError {
  readonly type = "ApplyUpdateError";

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
    super(message, state, update, undefined, context);
  }
}
