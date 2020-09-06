import { ChannelUpdate, ChannelState, Values } from "./types";
import { logger } from "./utils";

// Abstract error for package
export abstract class VectorError extends Error {
  // These will define the subclasses of errors.
  static readonly errors = {
    ChannelUpdateError: 'ChannelUpdateError',
    DepositError: 'DepositError',
    // etc.
  } as const;

  abstract readonly type: Values<typeof VectorError.errors>;
  static readonly reasons: {[key: string]: string};

  constructor(
    public readonly message: Values<typeof VectorError.reasons>,
    public readonly update: ChannelUpdate,
    public readonly state: ChannelState,
    public readonly context: any = undefined,
  ) {
    super(message);
  }
}

// Error type returned by the `processChannelMethod` function
export class ChannelUpdateError extends VectorError {
  readonly type = VectorError.errors.ChannelUpdateError;

  // This is the message that will be thrown by the error
  // and all other details will be logged
  static readonly reasons = {
    BadSignatures: 'BadSignatures',
    ChannelNotFound: 'ChannelNotFound', // See note in `processChannel`
    StaleUpdateNonce: 'StaleUpdateNonce',
    StaleChannelNonce: 'StaleChannelNonce',
    MergeUpdateFailed: 'MergeUpdateFailed',
    SaveChannelFailed: 'SaveChannelFailed',
  } as const;

  constructor(
    public readonly message: Values<typeof ChannelUpdateError.reasons>,
    public readonly update: ChannelUpdate,
    public readonly state: ChannelState,
    public readonly context: any = undefined,
  ) {
    super(message, update, state, context);
    // TODO: we may want to filter out some key items from the
    // state and update here instead of logging everything
    logger.error(message, {update, state, ...context});
  }
}