import {
  MAXIMUM_CHANNEL_TIMEOUT,
  MINIMUM_CHANNEL_TIMEOUT,
  MINIMUM_TRANSFER_TIMEOUT,
  MAXIMUM_TRANSFER_TIMEOUT,
} from "./constants";
import { UpdateParams, FullChannelState, ChannelUpdate } from "./channel";
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

  public toJson(): ResultJson {
    if (!this.isError) {
      return { isError: false, value: this.value };
    }
    return {
      isError: true,
      // NOTE: Error.message is not returned as a property
      // on default
      error:
        this.error instanceof Error
          ? {
              ...this.error,
              message: this.error.message,
            }
          : this.error,
    };
  }

  public static fromJson<U, Y extends Error>(json: ResultJson<U, Y>): Result<U, Y> {
    return json.isError ? Result.fail(json.error) : Result.ok(json.value);
  }

  public static fail<U, Y extends Error>(error: Y): Result<U, Y> {
    return new Result<U, Y>(error);
  }

  public static ok<T>(result: T): Result<T> {
    return new Result<T>(undefined, result);
  }
}

export type ResultJson<U = any, Y = any> =
  | {
      isError: true;
      error: Y;
    }
  | {
      isError: false;
      value: U;
    };

export type Values<E> = E[keyof E];

// Abstract error for package
export type VectorErrorJson = {
  message: string;
  name: string;
  context: any;
  type: string;
  stack?: string;
};
export abstract class VectorError extends Error {
  abstract readonly type: string;
  static readonly reasons: { [key: string]: string };

  constructor(public readonly msg: Values<typeof VectorError.reasons>, public readonly context: any = {}) {
    super(msg);
  }

  public toJson(): VectorErrorJson {
    return {
      message: this.message,
      name: this.name,
      context: this.context,
      type: this.type,
      stack: this.stack,
    };
  }
}

export class MessagingError extends VectorError {
  readonly type = "MessagingError";

  static readonly reasons = {
    Timeout: "Request timed out",
    Unknown: "Unknown messaging error",
  } as const;

  constructor(public readonly message: Values<typeof MessagingError.reasons>, public readonly context: any = {}) {
    super(message, context);
  }
}

export type ValidationContext = {
  params: UpdateParams<any> | ChannelUpdate<any>;
  state?: FullChannelState;
} & any;
export class ValidationError extends VectorError {
  readonly type = "ValidationError";

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
    TooManyAssets: "20 or more assets already in channel state",
    TransferNotActive: "Transfer not found in activeTransfers",
    TransferNotFound: "No transfer found in storage",
    TransferResolved: "Transfer has already been resolved",
    TransferTimeoutAboveChannel: `Transfer timeout must be less than the channel timeout`,
    TransferTimeoutBelowMin: `Transfer timeout below minimum of ${MINIMUM_TRANSFER_TIMEOUT.toString()}s`,
    TransferTimeoutAboveMax: `Transfer timeout above maximum of ${MAXIMUM_TRANSFER_TIMEOUT.toString()}s`,
    UnrecognizedType: "Unrecognized update type",
  } as const;

  public context: ValidationContext;

  constructor(
    public readonly message: Values<typeof OutboundChannelUpdateError.reasons>,
    params: UpdateParams<any> | ChannelUpdate<any>,
    state?: FullChannelState,
    context: any = {},
  ) {
    super(message, { ...context, params, state });
    this.context = { ...context, params, state };
  }
}

// Thrown by the protocol when applying an update
export type InboundChannelUpdateErrorContext = {
  update: ChannelUpdate<any>;
  state?: FullChannelState;
} & any;

// TODO: move to protocol
export class InboundChannelUpdateError extends VectorError {
  readonly type = "InboundChannelUpdateError";

  static readonly reasons = {
    ...ValidationError.reasons,
    ApplyUpdateFailed: "Failed to apply update",
    BadSignatures: "Could not recover signers",
    InboundValidationFailed: "Failed to validate incoming update",
    StaleChannel: "Channel state is behind, cannot apply update",
    StaleUpdate: "Update does not progress channel nonce",
    SaveChannelFailed: "Failed to save channel",
    SyncFailure: "Failed to sync channel from counterparty update",
  } as const;

  public context: InboundChannelUpdateErrorContext;

  constructor(
    public readonly message: Values<typeof InboundChannelUpdateError.reasons>,
    update: ChannelUpdate<any>,
    state?: FullChannelState,
    context: any = {},
  ) {
    super(message, { ...context, update, state });
    this.context = { ...context, update, state };
  }
}

// Thrown by the protocol when initiating an update
export type OutboundChannelUpdateErrorContext = {
  params: UpdateParams<any>;
  state?: FullChannelState;
} & any;
export class OutboundChannelUpdateError extends VectorError {
  readonly type = "OutboundChannelUpdateError";

  static readonly reasons = {
    ...ValidationError.reasons,
    ApplyUpdateFailed: "Failed to apply update",
    BadSignatures: "Could not recover signers",
    CounterpartyFailure: "Counterparty failed to apply update",
    CounterpartyOffline: "Message to counterparty timed out",
    Create2Failed: "Failed to get create2 address",
    InvalidParams: "Invalid params",
    OutboundValidationFailed: "Failed to validate outbound update",
    RegenerateUpdateFailed: "Failed to regenerate update after sync",
    SaveChannelFailed: "Failed to save channel",
    StaleChannel: "Channel state is behind, cannot apply update",
    SyncFailure: "Failed to sync channel from counterparty update",
    TransferNotRegistered: "Transfer not found in registry",
  } as const;

  public context: OutboundChannelUpdateErrorContext;

  constructor(
    public readonly message: Values<typeof OutboundChannelUpdateError.reasons>,
    params: UpdateParams<any>,
    state?: FullChannelState,
    context: any = {},
  ) {
    super(message, { ...context, params, state });
    this.context = { ...context, params, state };
  }
}

// NOTE: because this error is used between the browserNode AND
// the serverNode, it must stay in the types module
// TODO: break out into browser-node and server-node error types
export type LockErrorContext = {
  params: UpdateParams<any>;
  state?: FullChannelState;
} & any;
export class LockError extends VectorError {
  readonly type = "LockError";

  static readonly reasons = {
    Unknown: "Unknown Lock Error", // TODO
  };

  public context: LockErrorContext;

  constructor(public readonly message: string, lockName: string, context: any = {}) {
    super(message, { ...context, lockName });
    this.context = { ...context, lockName };
  }
}

// NOTE: because this error is used between the browserNode AND
// the serverNode, it must stay in the types module

// TODO: break out into browser-node and server-node error types
export class NodeError extends VectorError {
  readonly type = "NodeError";

  static readonly reasons = {
    InternalServerError: "Failed to send request",
    InvalidParams: "Request has invalid parameters",
    MultinodeProhibitted: "Not allowed to have multiple nodes",
    NoEvts: "No evts for event",
    NoPublicIdentifier: "Public identifier not supplied, and no default identifier",
    Timeout: "Timeout",
  } as const;

  constructor(public readonly message: Values<typeof NodeError.reasons>, public readonly context: any = {}) {
    super(message, context);
  }
}

export type EngineErrorContext = {
  channelAddress: string;
  publicIdentifier: string;
} & any;
export abstract class EngineError extends VectorError {
  readonly context: EngineErrorContext;

  constructor(public readonly msg: string, channelAddress: string, publicIdentifier: string, context: any = {}) {
    super(msg, { ...context, channelAddress, publicIdentifier });
    this.context = { ...context, channelAddress, publicIdentifier };
  }
}
