import { Values, VectorError } from "@connext/vector-types";

export class CollateralError extends VectorError {
  readonly type = "CollateralError";

  static readonly reasons = {
    ChannelNotFound: "Channel not found",
    CouldNotGetOnchainDeposits: "Unable to get total deposited onchain",
    ProviderNotFound: "Provider not found",
    UnableToGetRebalanceProfile: "Could not get rebalance profile",
    TargetHigherThanThreshold: "Specified target is higher than reclaim threshold",
    TxError: "Error sending deposit transaction",
    UnableToCollateralize: "Could not collateralize channel",
    UnableToReclaim: "Could not reclaim collateral from channel",
  } as const;

  constructor(public readonly message: Values<typeof CollateralError.reasons>, public readonly context: any = {}) {
    super(message, context);
  }
}

export class ForwardTransferError extends VectorError {
  readonly type = "ForwardTransferError";

  static readonly reasons = {
    SenderChannelNotFound: "Sender channel not found",
    RecipientChannelNotFound: "Recipient channel not found",
    UnableToCalculateSwap: "Could not calculate swap",
    UnableToGetRebalanceProfile: "Could not get rebalance profile",
    ErrorForwardingTransfer: "Error forwarding transfer",
    ErrorQueuingReceiverUpdate: "Unable to queue update for receiver retry",
    InvalidForwardingInfo: "Invalid information to forward transfer within meta",
    UnableToCollateralize: "Could not collateralize receiver channel",
    InvalidTransferDefinition: "Could not find transfer definition",
    StoredUpdateError: "Error in stored update",
    CheckInError: "Error processing isAlive",
    ReceiverOffline: "Recipient was not online, could not forward",
    FailedToCancelSenderTransfer: "Could not cancel sender transfer",
  } as const;

  constructor(public readonly message: Values<typeof ForwardTransferError.reasons>, public readonly context: any = {}) {
    super(message, context);
  }
}

export class ForwardResolutionError extends VectorError {
  readonly type = "ForwardResolutionError";

  static readonly reasons = {
    IncomingChannelNotFound: "Incoming channel for transfer not found",
    ErrorResolvingTransfer: "Error resolving tranfer",
  } as const;

  constructor(
    public readonly message: Values<typeof ForwardResolutionError.reasons>,
    public readonly context: any = {},
  ) {
    super(message, context);
  }
}
