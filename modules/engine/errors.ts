import { ChannelUpdate, ChannelState, Values } from "./types";
import { logger } from "./utils";

// TODO: Stronger message typings for known errors
export abstract class VectorError extends Error {
  static readonly errors = {
    ChannelUpdateError: 'ChannelUpdateError',
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

export class ChannelUpdateError extends VectorError {
  readonly type = VectorError.errors.ChannelUpdateError;

  static readonly reasons = {
    BadSignatures: 'BadSignatures',
    ChannelNotFound: 'ChannelNotFound',
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
    logger.error(message, {update, state, ...context});
  }
}