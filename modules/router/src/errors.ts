import { Values, RouterError, RouterErrorContext } from "@connext/vector-types";

import { RebalanceProfile } from "./config";

export type CollateralErrorContext = RouterErrorContext & {
  channelAddress: string;
  assetId: string;
  profile: RebalanceProfile;
  requested?: string;
};
export class CollateralError extends RouterError {
  static readonly type = "CollateralError";

  static readonly reasons = {
    ChannelNotFound: "Channel not found",
    CouldNotGetOnchainDeposits: "Unable to get total deposited onchain",
    NotInChannel: "Router is not found in channel",
    ProviderNotFound: "Provider not found",
    UnableToGetRebalanceProfile: "Could not get rebalance profile",
    TargetHigherThanThreshold: "Specified target is higher than reclaim threshold",
    TxError: "Error sending deposit transaction",
    UnableToCollateralize: "Could not collateralize channel",
    UnableToReclaim: "Could not reclaim collateral from channel",
  } as const;

  readonly context: CollateralErrorContext;

  constructor(
    public readonly message: Values<typeof CollateralError.reasons>,
    channelAddress: string,
    assetId: string,
    profile: RebalanceProfile,
    requested?: string,
    context: any = {},
  ) {
    super(message, { channelAddress, assetId, profile, requested, ...context }, CollateralError.type);
  }
}

export type SwapErrorContext = RouterErrorContext & {
  fromAmount: string;
  fromAssetId: string;
  fromChainId: number;
  toAssetId: string;
  toChainId: number;
};
export class SwapError extends RouterError {
  static readonly type = "SwapError";

  static readonly reasons = {
    SwapNotAllowed: "Swap is not configured in allowed swaps",
    SwapNotHardcoded: "Swap rate must be hardcoded",
  } as const;

  readonly context: SwapErrorContext;

  constructor(
    public readonly message: Values<typeof SwapError.reasons>,
    fromAmount: string,
    fromAssetId: string,
    fromChainId: number,
    toAssetId: string,
    toChainId: number,
    context: any = {},
  ) {
    super(message, { fromAmount, fromAssetId, fromChainId, toAssetId, toChainId, ...context }, SwapError.type);
  }
}

export type ForwardTransferCreationErrorContext = RouterErrorContext & {
  routingId: string;
  senderChannel: string;
  senderTransfer: string;
  receiverChannel: string;
};
export class ForwardTransferCreationError extends RouterError {
  static readonly type = "ForwardTransferCreationError";

  static readonly reasons = {
    SenderChannelNotFound: "Sender channel not found",
    RecipientChannelNotFound: "Recipient channel not found",
    UnableToCalculateSwap: "Could not calculate swap",
    ErrorForwardingTransfer: "Error forwarding transfer",
    ErrorQueuingReceiverUpdate: "Unable to queue update for receiver retry",
    InvalidForwardingInfo: "Invalid information to forward transfer within meta",
    UnableToCollateralize: "Could not collateralize receiver channel",
    InvalidTransferDefinition: "Could not find transfer definition",
    StoredUpdateError: "Error in stored update",
    ReceiverOffline: "Recipient was not online, could not forward",
    FailedToCancelSenderTransfer: "Could not cancel sender transfer",
  } as const;

  readonly context: ForwardTransferCreationErrorContext;

  constructor(
    public readonly message: Values<typeof ForwardTransferCreationError.reasons>,
    routingId: string,
    senderChannel: string,
    senderTransfer: string,
    receiverChannel: string,
    context: any = {},
  ) {
    super(
      message,
      {
        routingId,
        senderChannel,
        senderTransfer,
        receiverChannel,
        ...context,
      },
      ForwardTransferCreationError.type,
    );
  }
}

export type ForwardTransferResolutionErrorContext = ForwardTransferCreationErrorContext & { receiverTransfer: string };
export class ForwardTransferResolutionError extends RouterError {
  static readonly type = "ForwardTransferResolutionError";

  static readonly reasons = {
    IncomingChannelNotFound: "Incoming channel for transfer not found",
    ErrorResolvingTransfer: "Error resolving tranfer",
  } as const;

  readonly context: ForwardTransferResolutionErrorContext;

  constructor(
    public readonly message: Values<typeof ForwardTransferResolutionError.reasons>,
    routingId: string,
    senderChannel: string,
    senderTransfer: string,
    receiverChannel: string,
    receiverTransfer: string,
    context: any = {},
  ) {
    super(
      message,
      { routingId, senderChannel, senderTransfer, receiverChannel, receiverTransfer, ...context },
      ForwardTransferResolutionError.type,
    );
  }
}

export type CheckInErrorContext = RouterErrorContext;
export class CheckInError extends RouterError {
  static readonly type = "CheckInError";

  static readonly reasons = {
    CouldNotGetChannel: "Could not get channel, or not found",
    TasksFailed: "Router couldn't complete all check-in tasks",
    UpdatesFailed: "Could not forward all updates",
  } as const;

  readonly context: CheckInErrorContext;

  constructor(public readonly message: Values<typeof CheckInError.reasons>, channelAddress: string, context: any = {}) {
    super(message, { channelAddress, ...context }, CheckInError.type);
  }
}

export type ConfigServiceErrorContext = RouterErrorContext & {
  chainId: number;
  assetId: string;
};
export class ConfigServiceError extends RouterError {
  static readonly type = "ConfigServiceError";

  static readonly reasons = {
    UnableToGetRebalanceProfile: "Could not get rebalance profile",
  } as const;

  readonly context: ConfigServiceErrorContext;

  constructor(
    public readonly message: Values<typeof ConfigServiceError.reasons>,
    chainId: number,
    assetId: string,
    context: any = {},
  ) {
    super(message, { chainId, assetId, ...context }, ConfigServiceError.type);
  }
}

export type AutoRebalanceServiceErrorContext = RouterErrorContext & {
  chainId: number;
  assetId: string;
};
export class AutoRebalanceServiceError extends RouterError {
  static readonly type = "AutoRebalanceServiceError";

  static readonly reasons = {
    CouldNotGetAssetBalance: "Could not get asset balance",
    CouldNotCompleteApproval: "Could not complete approval",
    CouldNotCompleteRebalance: "Could not complete rebalance",
  } as const;

  readonly context: AutoRebalanceServiceErrorContext;

  constructor(
    public readonly message: Values<typeof AutoRebalanceServiceError.reasons>,
    chainId: number,
    assetId: string,
    context: any = {},
  ) {
    super(message, { chainId, assetId, ...context }, AutoRebalanceServiceError.type);
  }
}

export class ServerError extends RouterError {
  static readonly type = "ServerError";

  static readonly reasons = {
    Unauthorized: "Unauthorized",
  } as const;

  constructor(public readonly message: Values<typeof ServerError.reasons>, context: any = {}) {
    super(message, context, ServerError.type);
  }
}

export class FeeError extends RouterError {
  static readonly type = "FeeError";

  static readonly reasons = {
    NoSwap: "Could not find swap",
  } as const;

  constructor(public readonly message: Values<typeof FeeError.reasons>, context: any = {}) {
    super(message, context, FeeError.type);
  }
}