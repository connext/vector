import { NodeError, NodeErrorContext, Values } from "@connext/vector-types";

type ServerNodeErrorContext = NodeErrorContext & {
  publicIdentifier: string;
  params: any;
};
export class ServerNodeError extends NodeError {
  static readonly type = "ServerNodeError";

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

  readonly context: ServerNodeErrorContext;

  readonly code: number | undefined;

  constructor(
    public readonly msg: Values<typeof ServerNodeError.reasons>,
    publicIdentifier: string,
    // eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
    params: any,
    context: any = {},
    code?: number,
  ) {
    super(msg, { params, publicIdentifier, ...context }, ServerNodeError.type);
    this.code = code;
  }
}

type LockErrorContext = NodeErrorContext & {
  lockName: string;
  lockValue?: string;
};
export class ServerNodeLockError extends NodeError {
  static readonly type = "ServerNodeLockError";

  static readonly reasons = {
    AcquireLockFailed: "Failed to acquire lock",
    AcquireMessageFailed: "Could not send lock acquisition message",
    FailedToReleaseLock: "Failed to release lock",
    ReleaseMessageFailed: "Could not send lock release message",
    SentMessageAcquisitionFailed: "Could not acquire lock value, despite lock messsage",
  } as const;

  readonly context: LockErrorContext;

  constructor(
    public readonly msg: Values<typeof ServerNodeLockError.reasons>,
    lockName: string,
    lockValue?: string,
    context: any = {},
  ) {
    super(msg, { ...context, lockName, lockValue }, ServerNodeLockError.type);
  }
}
