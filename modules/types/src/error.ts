import { ChannelUpdate, FullChannelState, UpdateParams } from "./channel";

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
    BadUpdateType: "Unrecognized update type",
    ChannelAlreadySetup: "Channel is already setup",
    ChannelNotFound: "No channel found in storage",
    SetupTimeoutInvalid: "Provided state timeout is invalid",
    TransferNotActive: "Transfer not found in activeTransfers",
    TransferNotFound: "No transfer found in storage",
    ExternalValidationFailed: "Failed external validation",
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
    ApplyUpdateFailed: "Failed to apply update",
    BadSignatures: "Could not recover signers",
    BadUpdateType: "Unrecognized update type",
    ChannelNotFound: "No channel found in storage", // See note in `processChannel`
    CounterpartyFailure: "Counterparty failed to apply update",
    Create2Failed: "Failed to get create2 address",
    InvalidParams: "Invalid params",
    MessageFailed: "Failed to send message",
    OutboundValidationFailed: "Requested update is invalid",
    RestoreNeeded: "Channel too far out of sync, must be restored",
    RegenerateUpdateFailed: "Failed to regenerate update after sync",
    SaveChannelFailed: "Failed to save channel",
    StaleChannelNoUpdate: "Channel nonce is behind, no latest update from counterparty",
    StaleChannel: "Channel state is behind, cannot apply update",
    SyncSingleSigned: "Counterparty gave single signed update to sync, refusing",
    SyncFailure: "Failed to sync channel from counterparty update",
    SyncValidationFailed: "Failed to validate update for sync",
    TransferNotFound: "No transfer found in storage",
    TransferNotActive: "Transfer not found in activeTransfers",
    TransferNotRegistered: "Transfer not found in activeTransfers",
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

// Thrown by the protocol when applying an update
export class InboundChannelUpdateError extends VectorError {
  readonly type = VectorError.errors.InboundChannelUpdateError;

  static readonly reasons = {
    ApplyUpdateFailed: "Failed to apply update",
    BadSignatures: "Could not recover signers",
    BadUpdateType: "Unrecognized update type",
    ChannelNotFound: "No channel found in storage", // See note in `processChannel`
    DifferentIdentifiers: "Update changes channel publicIdentifiers",
    DifferentChannelAddress: "Update changes channelAddress",
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
    InternalServerError: "Failed to send request",
    InvalidParams: "Request has invalid parameters",
    ProviderNotFound: "Provider not available for chain",
    Timeout: "Timeout",
    TransactionNotMined: "Failed to wait for transaction to be mined",
  } as const;

  constructor(
    public readonly message: Values<typeof NodeError.reasons>,
    // eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
    public readonly context?: any,
  ) {
    super(message, context);
  }
}

// Thrown by the `generateUpdate`
// export class ChannelUpdateError extends VectorError {
//   readonly type = VectorError.errors.ChannelUpdateError;

//   // This is the message that will be thrown by the error
//   // and all other details will be logged
//   static readonly reasons = {
//     InvalidParams: "Invalid params",
//     ApplyUpdateFailed: "Failed to apply update",
//     BadSignatures: "Could not recover signers",
//     ChannelNotFound: "No channel found in storage", // See note in `processChannel`
//     StaleUpdateNonce: "Update does not progress state nonce",
//     StaleChannelNonce: "Stored nonce is stale for requested update",
//     MergeUpdateFailed: "Failed to merge update",
//     SaveChannelFailed: "Failed to save channel",
//     StaleChannelNonceNoUpdate: "Stored nonce is one behind, no latest update from counterparty",
//     MessageFailed: "Failed to send message",
//     TransferNotFound: "No transfer found in storage",
//     BadUpdateType: "Unrecognized update type",
//     Create2Failed: "Failed to get create2 address",
//   } as const;

//   constructor(
//     public readonly message: Values<typeof ChannelUpdateError.reasons>,
//     public readonly update?: ChannelUpdate<any> | (UpdateParams<any> & { nonce: number }),
//     public readonly state?: FullChannelState,
//     public readonly context?: any,
//   ) {
//     super(message, update, state, context);
//   }
// }
