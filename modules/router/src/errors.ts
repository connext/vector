import { Values, RouterError } from "@connext/vector-types";

export class CollateralError extends RouterError {
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

  constructor(
    public readonly message: Values<typeof CollateralError.reasons>,
    channelAddress: string,
    context: any = {},
  ) {
    super(message, channelAddress, context);
  }
}

export class SwapError extends RouterError {
  readonly type = "SwapError";

  static readonly reasons = {
    SwapNotAllowed: "Swap is not configured in allowed swaps",
    SwapNotHardcoded: "Swap rate must be hardcoded",
  } as const;

  constructor(
    public readonly message: Values<typeof SwapError.reasons>,
    fromAmount: string,
    fromAssetId: string,
    fromChainId: number,
    toAssetId: string,
    toChainId: number,
    context: any = {},
  ) {
    super(message, "", { fromAmount, fromAssetId, fromChainId, toAssetId, toChainId, ...context });
  }
}

export class ForwardTransferCreationError extends RouterError {
  readonly type = "ForwardTransferCreationError";

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

  constructor(
    public readonly message: Values<typeof ForwardTransferCreationError.reasons>,
    channelAddress: string,
    context: any = {},
  ) {
    super(message, channelAddress, context);
  }
}

export class ForwardTransferResolutionError extends RouterError {
  readonly type = "ForwardTransferResolutionError";

  static readonly reasons = {
    IncomingChannelNotFound: "Incoming channel for transfer not found",
    ErrorResolvingTransfer: "Error resolving tranfer",
  } as const;

  constructor(
    public readonly message: Values<typeof ForwardTransferResolutionError.reasons>,
    channelAddress: string,
    context: any = {},
  ) {
    super(message, channelAddress, context);
  }
}
