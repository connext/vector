import { ChannelUpdate, FullChannelState } from "@connext/vector-types";

import { Values } from "./types";
import { logger } from "./utils";

// Abstract error for package
export abstract class VectorError extends Error {
  // These will define the subclasses of errors.
  static readonly errors = {
    ChannelUpdateError: "ChannelUpdateError",
    DepositError: "DepositError",
    // etc.
  } as const;

  abstract readonly type: Values<typeof VectorError.errors>;
  static readonly reasons: { [key: string]: string };

  constructor(
    public readonly message: Values<typeof VectorError.reasons>,
    public readonly update: ChannelUpdate<any>,
    public readonly state: FullChannelState,
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
    applyUpdateFailed: "Failed to apply update",
    BadSignatures: "Could not recover signers",
    ChannelNotFound: "No channel found in storage", // See note in `processChannel`
    StaleUpdateNonce: "Update does not progress state nonce",
    StaleChannelNonce: "Stored nonce is stale for requested update",
    MergeUpdateFailed: "Failed to merge update",
    SaveChannelFailed: "Failed to save channel",
    StaleChannelNonceNoUpdate: "Stored nonce is one behind, no latest update from counterparty",
    MessageFailed: "Failed to send message",
  } as const;

  constructor(
    public readonly message: Values<typeof ChannelUpdateError.reasons>,
    public readonly update: ChannelUpdate<any>,
    public readonly state: FullChannelState,
    public readonly context: any = undefined,
  ) {
    super(message, update, state, context);
    // TODO: we may want to filter out some key items from the
    // state and update here instead of logging everything
    logger.error(message, { update, state, ...context });
  }
}
