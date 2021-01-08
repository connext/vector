import { NodeError, Values } from "@connext/vector-types";

export class ServerNodeError extends NodeError {
  readonly type = "ServerNodeError";

  static readonly reasons = {
    ChannelNotFound: "Channel not found",
    ClearStoreFailed: "Failed to clear store",
    CreateNodeFailed: "Could not create node",
    GetChannelFailed: "Failed to get channel from store",
    NodeNotFound: "Node not found",
    ProviderNotConfigured: "Provider not configured for chainId",
    RegisterSubscriptionFailed: "Failed to register subscription",
    SubscriptionNotFound: "Subscription URL not found",
    TransferNotFound: "Transfer not found",
  } as const;

  constructor(
    public readonly msg: Values<typeof ServerNodeError.reasons>,
    publicIdentifier: string,
    // eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
    params: any,
    context: any = {},
  ) {
    super(msg, publicIdentifier, params, context);
  }
}

export class ServerNodeLockError extends NodeError {
  readonly type = "ServerNodeLockError";

  static readonly reasons = {
    AcquireLockFailed: "Failed to acquire lock",
    AcquireMessageFailed: "Could not send lock acquisition message",
    FailedToReleaseLock: "Failed to release lock",
    ReleaseMessageFailed: "Could not send lock release message",
    SentMessageAcquisitionFailed: "Could not acquire lock value, despite lock messsage",
  } as const;

  constructor(
    public readonly msg: Values<typeof ServerNodeLockError.reasons>,
    // eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
    params: any,
    context: any = {},
  ) {
    super(msg, "", params, context);
  }
}
