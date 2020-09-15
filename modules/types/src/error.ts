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
      throw new Error("Can't get the value of an error result. Use 'errorValue' instead.");
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
    ChannelUpdateError: "ChannelUpdateError",
    DepositError: "DepositError",
    UpdateValidationError: "UpdateValidationError",
    OnchainTransactionError: "OnchainTransactionError",
    // etc.
  } as const;

  abstract readonly type: Values<typeof VectorError.errors>;
  static readonly reasons: { [key: string]: string };

  constructor(
    public readonly message: Values<typeof VectorError.reasons>,
    public readonly update?: ChannelUpdate<any> | (UpdateParams<any> & { nonce: number }),
    public readonly state?: FullChannelState,
    public readonly context?: any,
  ) {
    super(message);
  }
}

// Thrown by the `generateUpdate`
export class ChannelUpdateError extends VectorError {
  readonly type = VectorError.errors.ChannelUpdateError;

  // This is the message that will be thrown by the error
  // and all other details will be logged
  static readonly reasons = {
    applyUpdateFailed: "Failed to apply update",
    BadSignatures: "Could not recover signers",
    ChannelNotFound: "No channel found in storage", // See note in `processChannel`
    StaleUpdateNonce: "Update does not progress state nonce",
    StaleChannelNonce: "Stored nonce is stale for requested update",
    MergeUpdateFailed: "Failed to merge update",
    SaveChannelFailed: "Failed to save channel",
    StaleChannelNonceNoUpdate: "Stored nonce is one behind, no latest update from counterparty",
    MessageFailed: "Failed to send message",
    TransferNotFound: "No transfer found in storage",
    BadUpdateType: "Unrecognized update type",
  } as const;

  constructor(
    public readonly message: Values<typeof ChannelUpdateError.reasons>,
    public readonly update?: ChannelUpdate<any> | (UpdateParams<any> & { nonce: number }),
    public readonly state?: FullChannelState,
    public readonly context?: any,
  ) {
    super(message, update, state, context);
  }
}

// Thrown by validate.ts
export class UpdateValidationError extends VectorError {
  readonly type = VectorError.errors.UpdateValidationError;

  // This is the message that will be thrown by the error
  // and all other details will be logged
  static readonly reasons = {
    DifferentChannelAddress: "Update has different channel address than state",
    InvalidChannelAddress: "Channel address is not valid address",
    DifferentIdentifiers: "Update has different identifiers than state", // See note in `processChannel`
    StaleChannelNonce: "Nonce does not advance state",
    InvalidAssetId: "AssetId is not valid address",
    UnexpectedUpdateType: "Unexpected UpdateType in received update",
  } as const;

  constructor(
    public readonly message: Values<typeof UpdateValidationError.reasons>,
    public readonly update: ChannelUpdate<any>,
    public readonly state?: FullChannelState,
    public readonly context: any = undefined,
  ) {
    super(message, update, state, context);
  }
}
