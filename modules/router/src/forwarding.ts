import {
  ConditionalTransferCreatedPayload,
  ConditionalTransferResolvedPayload,
  Result,
  NodeResponses,
  Values,
  VectorError,
  RouterSchemas,
  NodeParams,
  TRANSFER_DECREMENT,
  INodeService,
  NodeError,
  FullChannelState,
  IsAlivePayload,
  FullTransferState,
} from "@connext/vector-types";
import { getBalanceForAssetId, decodeTransferResolver } from "@connext/vector-utils";
import { BaseLogger } from "pino";
import { BigNumber } from "@ethersproject/bignumber";

import { getSwappedAmount } from "./services/swap";
import { IRouterStore, RouterUpdateType, RouterUpdateStatus } from "./services/store";
import { ChainJsonProviders } from "./listener";
import { requestCollateral } from "./collateral";
export class ForwardTransferError extends VectorError {
  readonly type = VectorError.errors.RouterError;

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
    IsAliveError: "Error processing isAlive",
    ReceiverOffline: "Recipient was not online, could not forward",
    FailedToCancelSenderTransfer: "Could not cancel sender transfer",
  } as const;

  constructor(
    public readonly message: Values<typeof ForwardTransferError.reasons>,
    // eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
    public readonly context?: any,
  ) {
    super(message, context);
  }
}

export class ForwardResolutionError extends VectorError {
  readonly type = VectorError.errors.RouterError;

  static readonly reasons = {
    IncomingChannelNotFound: "Incoming channel for transfer not found",
    ErrorResolvingTransfer: "Error resolving tranfer",
  } as const;

  constructor(
    public readonly message: Values<typeof ForwardResolutionError.reasons>,
    // eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
    public readonly context?: any,
  ) {
    super(message, context);
  }
}

export async function forwardTransferCreation(
  data: ConditionalTransferCreatedPayload,
  routerPublicIdentifier: string,
  routerSignerAddress: string,
  nodeService: INodeService,
  store: IRouterStore,
  logger: BaseLogger,
  chainProviders: ChainJsonProviders,
): Promise<Result<any, ForwardTransferError>> {
  const method = "forwardTransferCreation";
  logger.info(
    { data, method, node: { routerSignerAddress, routerPublicIdentifier } },
    "Received transfer event, starting forwarding",
  );

  /*
  A note on the transfer event data and conditionalTransfer() params:

  In Indra, we have business logic bleed into several different parts of the stack. This means that adding support for new transfers
  involves making changes to several different places to add support for new params and event types.

  Ideally, all of these changes should now be isolated to the engine. The challenge with this is that consumers of the engine interface
  (or server-node interface) need to pass in the correct params for a given transfer. This means that in the router, we'd need to
  retain context into a conditional transfer type to correctly call the node conditionalTransfer() fn.

  We specifically don't want the router to operate this way. Given this, the best approach I can think of is to structure event/param objects
  for conditional transfer as follows:
  1. Have named fields for all of the data that would actually be needed by the router. This would be: `amount`, `assetId`, `recipientChainId`,
      `recipient`, `recipientAssetId`, `requireOnline`.
  2. Put all other params (basically everything related to the specifics of the condition: `type`, `lockHash`, etc.) into an opaque object
      that the router just catches from the transfer event and passes directly to the server-node.

  Because we're validating the actual conditional params + allowed transfer definitions at the lower levels, this feels safe to do.
  */

  // Create a helper to handle failures in this function by
  // cancelling the transfer that was created on the sender side
  const handleForwardingError = async (
    routingId: string,
    senderTransfer: FullTransferState,
    errorReason: Values<typeof ForwardTransferError.reasons>,
    context: any = {},
  ): Promise<Result<any, ForwardTransferError>> => {
    const transferResolverRes = await nodeService.getRegisteredTransfers({
      chainId: senderTransfer.chainId,
      publicIdentifier: routerPublicIdentifier,
    });
    if (transferResolverRes.isError) {
      return Result.fail(
        new ForwardTransferError(ForwardTransferError.reasons.FailedToCancelSenderTransfer, {
          cancellationError: transferResolverRes.getError()?.message,
          routingId,
          senderChannel: senderTransfer.channelAddress,
          senderTransfer: senderTransfer.transferId,
          cancellationReason: errorReason,
        }),
      );
    }

    // First, get the cancelling resolver for the transfer
    const { encodedCancel, resolverEncoding } =
      transferResolverRes.getValue().find((t) => t.definition === senderTransfer.transferDefinition) ?? {};
    if (!encodedCancel || !resolverEncoding) {
      return Result.fail(
        new ForwardTransferError(ForwardTransferError.reasons.FailedToCancelSenderTransfer, {
          cancellationError: "Sender transfer not in registry info",
          routingId,
          senderChannel: senderTransfer.channelAddress,
          senderTransfer: senderTransfer.transferId,
          cancellationReason: errorReason,
          transferDefinition: senderTransfer.transferDefinition,
          registered: transferResolverRes.getValue().map((t) => t.definition),
        }),
      );
    }

    // Attempt to resolve with cancellation reason, otherwise
    // store queued update
    // Resolve the sender transfer
    const resolveParams: NodeParams.ResolveTransfer = {
      publicIdentifier: routerPublicIdentifier,
      channelAddress: senderTransfer.channelAddress,
      transferId: senderTransfer.transferId,
      transferResolver: decodeTransferResolver(encodedCancel, resolverEncoding),
      meta: {
        cancellationReason: errorReason,
        cancellationContext: { ...context },
      },
    };
    const resolveResult = await nodeService.resolveTransfer(resolveParams);
    if (resolveResult.isError && resolveResult.getError()?.message !== NodeError.reasons.Timeout) {
      return Result.fail(
        new ForwardTransferError(ForwardTransferError.reasons.FailedToCancelSenderTransfer, {
          resolveError: resolveResult.getError()?.message,
          senderTransfer: senderTransfer.transferId,
          senderChannel: senderTransfer.channelAddress,
          routingId,
          cancellationReason: errorReason,
          ...context,
        }),
      );
    } else if (resolveResult.isError && resolveResult.getError()?.message === NodeError.reasons.Timeout) {
      // Store the transfer, retry later
      // TODO: add logic to periodically retry resolving transfers
      logger.warn({ senderTransfer: senderTransfer.transferId }, "Cancellation queued");
      await store.queueUpdate(senderTransfer.channelAddress, RouterUpdateType.TRANSFER_RESOLUTION, resolveParams);
    }

    // return
    return Result.fail(
      new ForwardTransferError(errorReason, {
        senderTransfer: senderTransfer.transferId,
        senderChannel: senderTransfer.channelAddress,
        routingId,
        details: "Sender transfer cancelled/queued",
        ...context,
      }),
    );
  };

  const { transfer: senderTransfer, conditionType } = data;
  const {
    balance: {
      amount: [senderAmount],
    },
    assetId: senderAssetId,
    meta: untypedMeta,
    transferState: createdTransferState,
    channelAddress: senderChannelAddress,
    initiator,
    transferTimeout,
    transferDefinition: senderTransferDefinition,
  } = senderTransfer;
  const meta = { ...untypedMeta } as RouterSchemas.RouterMeta & any;
  const { routingId } = meta ?? {};
  const [path] = meta.path ?? [];
  const recipientIdentifier = path?.recipient;
  if (!routingId || !path || !recipientIdentifier) {
    return Result.fail(
      new ForwardTransferError(ForwardTransferError.reasons.InvalidForwardingInfo, {
        meta,
        senderTransfer: senderTransfer.transferId,
        senderChannel: senderTransfer.channelAddress,
      }),
    );
  }

  const senderChannelRes = await nodeService.getStateChannel({
    channelAddress: senderChannelAddress,
    publicIdentifier: routerPublicIdentifier,
  });
  if (senderChannelRes.isError) {
    // Cancelling will fail
    return Result.fail(
      new ForwardTransferError(ForwardTransferError.reasons.SenderChannelNotFound, {
        nodeError: senderChannelRes.getError()?.message,
      }),
    );
  }
  const senderChannel = senderChannelRes.getValue() as FullChannelState;
  if (!senderChannel) {
    // Cancelling will fail
    return Result.fail(
      new ForwardTransferError(ForwardTransferError.reasons.SenderChannelNotFound, {
        channelAddress: senderChannelAddress,
      }),
    );
  }
  const senderChainId = senderChannel.networkContext.chainId;

  // Defaults
  const recipientAssetId = path.recipientAssetId ?? senderAssetId;
  const requireOnline = meta.requireOnline ?? false;
  const recipientChainId = path.recipientChainId ?? senderChainId;

  // Below, we figure out the correct params needed for the receiver's channel. This includes
  // potential swaps/crosschain stuff
  let recipientAmount = senderAmount;
  if (recipientAssetId !== senderAssetId || recipientChainId !== senderChainId) {
    logger.warn({ method, recipientAssetId, senderAssetId, recipientChainId }, "Detected inflight swap");
    const swapRes = await getSwappedAmount(
      senderAmount,
      senderAssetId,
      senderChainId,
      recipientAssetId,
      recipientChainId,
    );
    if (swapRes.isError) {
      return handleForwardingError(routingId, senderTransfer, ForwardTransferError.reasons.UnableToCalculateSwap, {
        swapError: swapRes.getError()?.message,
        swapContext: swapRes.getError()?.context,
      });
    }
    recipientAmount = swapRes.getValue();

    logger.warn(
      {
        method,
        recipientAssetId,
        recipientAmount,
        recipientChainId,
        senderTransferDefinition,
        senderAmount,
        senderAssetId,
        conditionType,
      },
      "Inflight swap calculated",
    );
  }

  // Next, get the recipient's channel and figure out whether it needs to be collateralized
  // TODO: Do we want to cancel or hold payment in this case?
  const recipientChannelRes = await nodeService.getStateChannelByParticipants({
    publicIdentifier: routerPublicIdentifier,
    counterparty: recipientIdentifier,
    chainId: recipientChainId,
  });
  if (recipientChannelRes.isError) {
    return handleForwardingError(routingId, senderTransfer, ForwardTransferError.reasons.RecipientChannelNotFound, {
      storeError: recipientChannelRes.getError()?.message,
    });
  }
  // TODO: Do we want to cancel or hold payment in this case?
  const recipientChannel = recipientChannelRes.getValue();
  if (!recipientChannel) {
    return handleForwardingError(routingId, senderTransfer, ForwardTransferError.reasons.RecipientChannelNotFound, {
      participants: [routerPublicIdentifier, recipientIdentifier],
      chainId: recipientChainId,
    });
  }

  const routerBalance = getBalanceForAssetId(
    recipientChannel as FullChannelState,
    recipientAssetId,
    routerPublicIdentifier === recipientChannel.aliceIdentifier ? "alice" : "bob",
  );

  // Create the params you will transfer with
  const { balance, ...details } = createdTransferState;
  const params = {
    channelAddress: recipientChannel.channelAddress,
    amount: recipientAmount,
    assetId: recipientAssetId,
    timeout: BigNumber.from(transferTimeout).sub(TRANSFER_DECREMENT).toString(),
    type: conditionType,
    publicIdentifier: routerPublicIdentifier,
    details,
    meta: {
      // Node is never the initiator, that is always payment sender
      senderIdentifier: initiator === senderChannel.bob ? senderChannel.bobIdentifier : senderChannel.aliceIdentifier,
      ...meta,
    },
  };

  // helper to queue router update
  const queueUpdate = async (error: string) => {
    // attempt to store transfer
    try {
      const type = RouterUpdateType.TRANSFER_CREATION;
      await store.queueUpdate(recipientChannel.channelAddress, type, params);
      // log warning and return success
      logger.warn(
        {
          receiverError: error,
          senderChannel: senderChannel.channelAddress,
          senderTransfer: senderTransfer.transferId,
          routingId,
        },
        `Failed to create receiver transfer, will retry`,
      );
      // return failure without cancelling sender-side payment
      return Result.fail(
        new ForwardTransferError(ForwardTransferError.reasons.ReceiverOffline, {
          receiverError: error,
          senderChannel: senderChannel.channelAddress,
          senderTransfer: senderTransfer.transferId,
          routingId,
        }),
      );
    } catch (e) {
      return handleForwardingError(routingId, senderTransfer, ForwardTransferError.reasons.ErrorQueuingReceiverUpdate, {
        storeError: e.message,
      });
    }
  };

  if (BigNumber.from(routerBalance).lt(recipientAmount)) {
    logger.info({ routerBalance, recipientAmount }, "Requesting collateral to cover transfer");
    const requestCollateralRes = await requestCollateral(
      recipientChannel as FullChannelState,
      recipientAssetId,
      routerPublicIdentifier,
      nodeService,
      chainProviders,
      logger,
      undefined,
      recipientAmount,
    );
    // TODO: Do we want to cancel or hold payment in this case?
    if (requestCollateralRes.isError) {
      // Reconciling may fail if the recipient is offline, do not cancel
      if (requireOnline) {
        // Don't queue
        return handleForwardingError(routingId, senderTransfer, ForwardTransferError.reasons.UnableToCollateralize, {
          collateralError: requestCollateralRes.getError()?.message,
          collateralContext: requestCollateralRes.getError()?.context,
        });
      }
      return queueUpdate(
        requestCollateralRes.getError()?.message ?? ForwardTransferError.reasons.UnableToCollateralize,
      );
    }
  }

  // If the above is not the case, we can make the transfer!
  const transfer = await nodeService.conditionalTransfer(params);
  if (transfer.isError) {
    // TODO: properly implement offline payments
    if (!requireOnline && transfer.getError()?.message === NodeError.reasons.Timeout) {
      // queue for later
      return queueUpdate(transfer.getError()!.message);
    }
    return handleForwardingError(routingId, senderTransfer, ForwardTransferError.reasons.ErrorForwardingTransfer, {
      createError: transfer.getError()?.message,
      ...(transfer.getError()!.context ?? {}),
    });
  }

  return Result.ok(transfer.getValue());
}

export async function forwardTransferResolution(
  data: ConditionalTransferResolvedPayload,
  routerPublicIdentifier: string,
  routerSignerAddress: string,
  nodeService: INodeService,
  store: IRouterStore,
  logger: BaseLogger,
): Promise<Result<undefined | NodeResponses.ResolveTransfer, ForwardResolutionError>> {
  const method = "forwardTransferResolution";
  logger.info(
    { data, method, node: { routerSignerAddress, routerPublicIdentifier } },
    "Received transfer resolution, starting forwarding",
  );
  const {
    channelAddress,
    transfer: { transferId, transferResolver, meta },
  } = data;
  const { routingId } = meta as RouterSchemas.RouterMeta;

  // Find the channel with the corresponding transfer to unlock
  const transfersRes = await nodeService.getTransfersByRoutingId({
    routingId,
    publicIdentifier: routerPublicIdentifier,
  });
  if (transfersRes.isError) {
    return Result.fail(
      new ForwardResolutionError(ForwardResolutionError.reasons.IncomingChannelNotFound, {
        routingId,
        error: transfersRes.getError()?.message,
      }),
    );
  }

  // find transfer where node is responder
  const incomingTransfer = transfersRes.getValue().find((transfer) => transfer.responder === routerSignerAddress);

  if (!incomingTransfer) {
    return Result.fail(
      new ForwardResolutionError(ForwardResolutionError.reasons.IncomingChannelNotFound, {
        routingId,
      }),
    );
  }

  // Resolve the sender transfer
  const resolveParams: NodeParams.ResolveTransfer = {
    channelAddress: incomingTransfer.channelAddress,
    transferId: incomingTransfer.transferId,
    meta: {},
    transferResolver,
    publicIdentifier: routerPublicIdentifier,
  };
  const resolution = await nodeService.resolveTransfer(resolveParams);
  if (resolution.isError) {
    // Store the transfer, retry later
    // TODO: add logic to periodically retry resolving transfers
    const type = RouterUpdateType.TRANSFER_RESOLUTION;
    await store.queueUpdate(incomingTransfer.channelAddress, type, resolveParams);
    return Result.fail(
      new ForwardResolutionError(ForwardResolutionError.reasons.ErrorResolvingTransfer, {
        message: resolution.getError()?.message,
        routingId,
        transferResolver,
        incomingTransferChannel: incomingTransfer.channelAddress,
        recipientTransferId: transferId,
        recipientChannelAddress: channelAddress,
      }),
    );
  }

  return Result.ok(resolution.getValue());
}

export async function handleIsAlive(
  data: IsAlivePayload,
  routerPublicIdentifier: string,
  signerAddress: string,
  nodeService: INodeService,
  store: IRouterStore,
  chainProviders: ChainJsonProviders,
  logger: BaseLogger,
): Promise<Result<undefined, ForwardTransferError>> {
  const method = "handleIsAlive";
  logger.info(
    { data, method, node: { signerAddress, routerPublicIdentifier } },
    "Received isAlive event, starting handler",
  );
  // This means the user is online and has checked in. Get all updates that are queued and then execute them.
  const updates = await store.getQueuedUpdates(data.channelAddress, RouterUpdateStatus.PENDING);
  const erroredUpdates = [];
  for (const update of updates) {
    logger.info({ method, update }, "Found update for isAlive channel");
    let transferResult;
    if (update.type === RouterUpdateType.TRANSFER_CREATION) {
      // first collateralize if needed
      const params = update.payload as NodeParams.ConditionalTransfer;
      const channelStateRes = await nodeService.getStateChannel({ channelAddress: data.channelAddress });
      if (channelStateRes.isError) {
        transferResult = channelStateRes;
      } else {
        const channelState = channelStateRes.getValue();
        const routerBalance = getBalanceForAssetId(
          channelState as FullChannelState,
          params.assetId,
          routerPublicIdentifier === channelState?.aliceIdentifier ? "alice" : "bob",
        );
        if (BigNumber.from(routerBalance).lt(params.amount)) {
          logger.info({ routerBalance, recipientAmount: params.amount }, "Requesting collateral to cover transfer");
          const requestCollateralRes = await requestCollateral(
            channelState as FullChannelState,
            params.assetId,
            routerPublicIdentifier,
            nodeService,
            chainProviders,
            logger,
            undefined,
            params.amount,
          );
          // TODO: Do we want to cancel or hold payment in this case?
          if (requestCollateralRes.isError) {
            transferResult = requestCollateralRes;
          }
        }
      }
      if (!transferResult?.isError) {
        transferResult = await nodeService.conditionalTransfer(update.payload as NodeParams.ConditionalTransfer);
      }
    } else if (update.type === RouterUpdateType.TRANSFER_RESOLUTION) {
      transferResult = await nodeService.resolveTransfer(update.payload as NodeParams.ResolveTransfer);
    } else {
      return Result.fail(
        new ForwardTransferError(ForwardTransferError.reasons.StoredUpdateError, {
          message: "Unknown update type",
          update,
        }),
      );
    }
    if (transferResult.isError) {
      logger.error(
        { method, message: transferResult.getError()?.message, context: transferResult.getError()?.context, update },
        "Error in transfer",
      );
      await store.setUpdateStatus(update.id, RouterUpdateStatus.FAILED, transferResult.getError()?.message);
      erroredUpdates.push(update);
    }
    logger.info({ transferResult: transferResult.getValue(), update, method }, "Successful handled isAlive update");
  }
  if (erroredUpdates.length > 0) {
    return Result.fail(
      new ForwardTransferError(ForwardTransferError.reasons.IsAliveError, {
        failedIds: erroredUpdates.map((update) => update.id),
      }),
    );
  }
  return Result.ok(undefined);
}
