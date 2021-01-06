import { EngineError, Values } from "@connext/vector-types";

export class DisputeError extends EngineError {
  readonly type = "DisputeError";

  static readonly reasons = {
    ChannelDefundTxFailed: "Failed to send defund channel tx",
    ChannelDisputeTxFailed: "Failed to send dispute channel tx",
    ChannelNotInDispute: "Channel is not in dispute",
    ChannelNotFound: "Channel not found",
    CouldNotGetActiveTransfers: "Failed to retrieve active transfers from store",
    CouldNotGetChannel: "Failed to retrieve channel from store",
    CouldNotGetTransfer: "Failed to retrieve transfer from store",
    TransferNotFound: "Transfer not found",
    TransferNotDisputed: "Transfer not in dispute",
    TransferDefundTxFailed: "Failed to send defund transfer tx",
    TransferDisputeTxFailed: "Failed to send dispute transfer tx",
    Unknown: "Unknown dispute error",
  } as const;

  constructor(
    public readonly message: Values<typeof DisputeError.reasons>,
    channelAddress: string,
    publicIdentifier: string,
    context: any = {},
  ) {
    super(message, channelAddress, publicIdentifier, context);
  }
}

export class CheckInError extends EngineError {
  readonly type = "CheckInError";

  static readonly reasons = {
    ChannelNotFound: "Channel not found",
    Unknown: "Unknown check-in error",
  } as const;

  constructor(
    public readonly message: Values<typeof CheckInError.reasons>,
    channelAddress: string,
    publicIdentifier: string,
    context: any = {},
  ) {
    super(message, channelAddress, publicIdentifier, context);
  }
}

export class RestoreError extends EngineError {
  readonly type = "RestoreError";

  static readonly reasons = {
    AckFailed: "Could not send restore ack",
    AcquireLockError: "Failed to acquire restore lock",
    ChannelNotFound: "Channel not found",
    CouldNotGetActiveTransfers: "Failed to retrieve active transfers from store",
    CouldNotGetChannel: "Failed to retrieve channel from store",
    GetChannelAddressFailed: "Failed to calculate channel address for verification",
    InvalidChannelAddress: "Failed to verify channel address",
    InvalidMerkleRoot: "Failed to validate merkleRoot for restoration",
    InvalidSignatures: "Failed to validate sigs on latestUpdate",
    NoData: "No data sent from counterparty to restore",
    ReleaseLockError: "Failed to release restore lock",
    SaveChannelFailed: "Failed to save channel state",
    SyncableState: "Cannot restore, state is syncable. Try reconcileDeposit",
  } as const;

  constructor(
    public readonly message: Values<typeof RestoreError.reasons>,
    channelAddress: string,
    publicIdentifier: string,
    context: any = {},
  ) {
    super(message, channelAddress, publicIdentifier, context);
  }
}

export class IsAliveError extends EngineError {
  readonly type = "IsAliveError";

  static readonly reasons = {
    ChannelNotFound: "Channel not found",
    Unknown: "Unknown isAlive error",
  } as const;

  constructor(
    public readonly message: Values<typeof IsAliveError.reasons>,
    channelAddress: string,
    publicIdentifier: string,
    context: any = {},
  ) {
    super(message, channelAddress, publicIdentifier, context);
  }
}

export class ParameterConversionError extends EngineError {
  readonly type = "ParameterConversionError";

  static readonly reasons = {
    CannotSendToSelf: "An initiator cannot be a receiver on the same chain",
    CouldNotSignWithdrawal: "Failed to sign withdrawal commitment",
    FailedToGetRegisteredTransfer: "Could not get transfer registry information",
  } as const;

  constructor(
    public readonly message: Values<typeof ParameterConversionError.reasons>,
    channelAddress: string,
    publicIdentifier: string,
    context: any = {},
  ) {
    super(message, channelAddress, publicIdentifier, context);
  }
}

export class RpcError extends EngineError {
  readonly type = "RpcError";

  static readonly reasons = {
    InvalidParams: "Parameters from rpc request are malformed",
    InvalidRpcSchema: "Rpc request is malformed",
    InvalidMethod: "Rpc method is invalid",
    StoreMethodFailed: "Failed to execute store method",
    ProtocolMethodFailed: "Failed to execute protocol method",
  } as const;

  constructor(
    public readonly message: Values<typeof RpcError.reasons>,
    channelAddress: string,
    publicIdentifier: string,
    context: any = {},
  ) {
    super(message, channelAddress, publicIdentifier, context);
  }
}
