import { NodeError, NodeErrorContext, Values } from "@connext/vector-types";

type ServerNodeErrorContext = NodeErrorContext & {
  publicIdentifier: string;
  params: any;
};
export class ServerNodeError extends NodeError {
  static readonly type = "ServerNodeError";

  static readonly reasons = {
    ChainServiceNotFound: "Chain service not found",
    ChannelNotFound: "Channel not found",
    ClearStoreFailed: "Failed to clear store",
    CommitmentNotFound: "Withdrawal commitment not found",
    CommitmentSingleSigned: "Withdrawal commitment single-signed",
    CreateNodeFailed: "Could not create node",
    GetChannelFailed: "Failed to get channel from store",
    NodeNotFound: "Node not found",
    ProviderNotConfigured: "Provider not configured for chainId",
    RegisterSubscriptionFailed: "Failed to register subscription",
    StoreMethodFailed: "Failed to execute store method",
    SubscriptionNotFound: "Subscription URL not found",
    TransactionNotFound: "Transaction not found",
    TransferNotFound: "Transfer not found",
    Unauthorized: "Unauthorized",
  } as const;

  readonly context: ServerNodeErrorContext;

  constructor(
    public readonly msg: Values<typeof ServerNodeError.reasons>,
    publicIdentifier: string,
    // eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
    params: any,
    context: any = {},
  ) {
    super(msg, { params, publicIdentifier, ...context }, ServerNodeError.type);
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
    this.context = { lockName, lockValue, ...context };
  }
}

type ResubmitWithdrawalErrorContext = {
  channelAddress: string;
  publicIdentifier: string;
  transferId: string;
};
export class ResubmitWithdrawalError extends NodeError {
  static readonly type = "ResubmitWithdrawalError";

  static readonly reasons = {
    ChainServiceNotFound: "Could not find chain service",
    CouldNotCheckSubmissionStatus: "Failed to check withdrawal submission status onchain",
    CouldNotGetChannels: "Failed to get channels from store",
    CouldNotGetCommitments: "Failed to get unsubmitted withdrawals",
    CouldNotGetGasPrice: "Failed to get mainnet gas price",
    SavingCommitmentFailed: "Failed to save withdrawal commitment",
    SubmissionFailed: "Failed to submit withdrawal onchain",
    WithdrawalDefinitionNotFound: "Failed to retrieve withdrawal definition from registry",
  } as const;

  readonly context: ResubmitWithdrawalErrorContext;

  constructor(
    public readonly msg: Values<typeof ResubmitWithdrawalError.reasons>,
    publicIdentifier: string,
    channelAddress: string,
    transferId: string,
    context: any = {},
  ) {
    super(msg, { channelAddress, publicIdentifier, transferId, ...context }, ServerNodeError.type);
    this.context = { channelAddress, publicIdentifier, transferId, ...context };
  }
}
