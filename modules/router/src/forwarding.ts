import {
  ConditionalTransferCreatedPayload,
  ConditionalTransferResolvedPayload,
  Result,
  NodeResponses,
  Values,
  RouterSchemas,
  NodeParams,
  TRANSFER_DECREMENT,
  INodeService,
  FullChannelState,
  IsAlivePayload,
  FullTransferState,
  IVectorChainReader,
  NodeError,
  jsonifyError,
  TransferNames,
  VectorErrorJson,
} from "@connext/vector-types";
import Ajv from "ajv";
import { BaseLogger } from "pino";
import { BigNumber } from "@ethersproject/bignumber";
import { getRandomBytes32, getSignerAddressFromPublicIdentifier } from "@connext/vector-utils";
import { AddressZero } from "@ethersproject/constants";
import { getAddress } from "@ethersproject/address";

import { getSwappedAmount } from "./services/swap";
import { IRouterStore, RouterUpdateType, RouterUpdateStatus, RouterStoredUpdate } from "./services/store";
import { CheckInError, ForwardTransferCreationError, ForwardTransferResolutionError } from "./errors";
import {
  cancelCreatedTransfer,
  attemptTransferWithCollateralization,
  transferWithCollateralization,
} from "./services/transfer";
import { inProgressCreations } from "./listener";

const ajv = new Ajv();

export async function forwardTransferCreation(
  data: ConditionalTransferCreatedPayload,
  routerPublicIdentifier: string,
  routerSignerAddress: string,
  nodeService: INodeService,
  store: IRouterStore,
  logger: BaseLogger,
  chainReader: IVectorChainReader,
): Promise<
  Result<
    (NodeResponses.ConditionalTransfer & { recipientAmount: string; recipientAssetId: string }) | undefined,
    ForwardTransferCreationError
  >
> {
  const method = "forwardTransferCreation";
  const methodId = getRandomBytes32();
  logger.info(
    {
      method,
      methodId,
      routerPublicIdentifier,
      routerSignerAddress,
      senderTransferId: data.transfer.transferId,
      senderChannelAddress: data.channelAddress,
      routingId: data.transfer?.meta?.routingId,
    },
    "Method started",
  );
  inProgressCreations[data.transfer.channelAddress].push(data.transfer.transferId);
  logger.debug({ method, methodId, event: data }, "Event data");

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
  const cancelSenderTransferAndReturnError = async (
    routingId: string,
    senderTransfer: FullTransferState,
    errorReason: Values<typeof ForwardTransferCreationError.reasons>,
    receiverChannel = "",
    context: any = {},
  ): Promise<Result<any, ForwardTransferCreationError>> => {
    logger.warn(
      {
        method,
        methodId,
        senderChannelAddress: senderTransfer.channelAddress,
        senderTransferId: senderTransfer.transferId,
        routingId,
        receiverChannelAddress: receiverChannel,
        cancellationReason: errorReason,
      },
      "Cancelling sender transfer",
    );
    const cancelRes = await cancelCreatedTransfer(
      errorReason,
      senderTransfer,
      routerPublicIdentifier,
      nodeService,
      store,
      logger,
      receiverChannel,
      context,
    );
    if (cancelRes.isError) {
      // Failed to execute or enqueue cancellation update
      return Result.fail(cancelRes.getError()!);
    }
    // Cancellation either enqueued or executed
    return Result.fail(
      new ForwardTransferCreationError(
        errorReason,
        routingId,
        senderTransfer.channelAddress,
        senderTransfer.transferId,
        receiverChannel,
        {
          ...context,
          senderTransferCancellation: !!cancelRes.getValue() ? "executed" : "enqueued",
        },
      ),
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
  } = senderTransfer;
  const meta = { ...untypedMeta } as RouterSchemas.RouterMeta & any;
  const { routingId } = meta ?? {};
  const [path] = meta.path ?? [];
  const recipientIdentifier = path?.recipient;
  if (!routingId || !path || !recipientIdentifier) {
    return Result.fail(
      new ForwardTransferCreationError(
        ForwardTransferCreationError.reasons.InvalidForwardingInfo,
        routingId,
        senderChannelAddress,
        senderTransfer.transferId,
        "",
        {
          meta,
        },
      ),
    );
  }

  const senderChannelRes = await nodeService.getStateChannel({
    channelAddress: senderChannelAddress,
    publicIdentifier: routerPublicIdentifier,
  });
  if (senderChannelRes.isError) {
    // Cancelling will fail
    return Result.fail(
      new ForwardTransferCreationError(
        ForwardTransferCreationError.reasons.SenderChannelNotFound,
        routingId,
        senderChannelAddress,
        senderTransfer.transferId,
        "",
        {
          nodeError: senderChannelRes.getError()!.toJson(),
        },
      ),
    );
  }
  const senderChannel = senderChannelRes.getValue() as FullChannelState;
  if (!senderChannel) {
    // Cancelling will fail
    return Result.fail(
      new ForwardTransferCreationError(
        ForwardTransferCreationError.reasons.SenderChannelNotFound,
        routingId,
        senderChannelAddress,
        senderTransfer.transferId,
        "",
      ),
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
    logger.info(
      {
        method,
        methodId,
        recipientAssetId,
        senderAssetId,
        recipientChainId,
        senderChainId,
        conditionType,
      },
      "Detected inflight swap",
    );
    const swapRes = await getSwappedAmount(
      senderAmount,
      senderAssetId,
      senderChainId,
      recipientAssetId,
      recipientChainId,
    );
    if (swapRes.isError) {
      return cancelSenderTransferAndReturnError(
        routingId,
        senderTransfer,
        ForwardTransferCreationError.reasons.UnableToCalculateSwap,
        "",
        {
          swapError: swapRes.getError(),
        },
      );
    }
    recipientAmount = swapRes.getValue();

    logger.info(
      {
        method,
        methodId,
        recipientAmount,
        senderAmount,
      },
      "Inflight swap calculated",
    );
  }

  // Next, get the recipient's channel and figure out whether it needs to be collateralized
  const recipientChannelRes = await nodeService.getStateChannelByParticipants({
    publicIdentifier: routerPublicIdentifier,
    counterparty: recipientIdentifier,
    chainId: recipientChainId,
  });
  if (recipientChannelRes.isError) {
    return cancelSenderTransferAndReturnError(
      routingId,
      senderTransfer,
      ForwardTransferCreationError.reasons.RecipientChannelNotFound,
      "",
      {
        storeError: recipientChannelRes.getError()!.toJson(),
        recipientChainId,
        recipientIdentifier,
      },
    );
  }
  const recipientChannel = recipientChannelRes.getValue() as FullChannelState | undefined;
  if (!recipientChannel) {
    return cancelSenderTransferAndReturnError(
      routingId,
      senderTransfer,
      ForwardTransferCreationError.reasons.RecipientChannelNotFound,
      "",
      {
        participants: [routerPublicIdentifier, recipientIdentifier],
        chainId: recipientChainId,
      },
    );
  }

  // Create the params you will transfer with
  const { balance, ...details } = createdTransferState;
  const newMeta = {
    // Node is never the initiator, that is always payment sender
    senderIdentifier: initiator === senderChannel.bob ? senderChannel.bobIdentifier : senderChannel.aliceIdentifier,
    ...meta,
  };
  const params = {
    channelAddress: recipientChannel.channelAddress,
    amount: recipientAmount,
    assetId: recipientAssetId,
    timeout: BigNumber.from(transferTimeout).sub(TRANSFER_DECREMENT).toString(),
    type: conditionType,
    publicIdentifier: routerPublicIdentifier,
    details,
    meta: newMeta,
  };
  logger.info({ method, methodId, params }, "Generated new transfer params");

  const transferRes = await attemptTransferWithCollateralization(
    params,
    recipientChannel,
    routerPublicIdentifier,
    nodeService,
    store,
    chainReader,
    logger,
    requireOnline,
    { routingId, senderChannel: senderChannelAddress, senderTransfer: senderTransfer.transferId },
  );
  if (!transferRes.isError) {
    // transfer was either queued or executed
    const value = transferRes.getValue();
    return !!value
      ? Result.ok({ ...value, recipientAmount, recipientAssetId })
      : Result.fail(
          new ForwardTransferCreationError(
            ForwardTransferCreationError.reasons.ReceiverOffline,
            routingId,
            senderChannelAddress,
            senderTransfer.transferId,
            recipientChannel.channelAddress,
          ),
        );
  }

  // check if you should cancel the sender
  const error = transferRes.getError()!;
  logger.error({ ...jsonifyError(error) }, "Failed to forward transfer");
  if (error.context.shouldCancelSender) {
    return cancelSenderTransferAndReturnError(
      routingId,
      senderTransfer,
      error.message,
      recipientChannel.channelAddress,
    );
  }

  // There was an error, but we cannot safely cancel the sender transfer
  // because we have sent a single signed update to the receiver.
  // In this case, we need to know if the transfer was successfully sent
  // to the receiver, or if we should retry the transfer. This case can
  // be handled on check-in, so store the update as an update pending
  // verification
  await store.queueUpdate(
    recipientChannel.channelAddress,
    RouterUpdateType.TRANSFER_CREATION,
    params,
    RouterUpdateStatus.UNVERIFIED,
  );

  // return failure without cancelling
  logger.info({ method, methodId }, "Method complete");
  return Result.fail(error);
}

export async function forwardTransferResolution(
  data: ConditionalTransferResolvedPayload,
  routerPublicIdentifier: string,
  routerSignerAddress: string,
  nodeService: INodeService,
  store: IRouterStore,
  logger: BaseLogger,
): Promise<Result<undefined | (NodeResponses.ResolveTransfer & { assetId: string }), ForwardTransferResolutionError>> {
  const method = "forwardTransferResolution";
  const methodId = getRandomBytes32();
  logger.info(
    {
      method,
      methodId,
      routerPublicIdentifier,
      routerSignerAddress,
      receiverTransferId: data.transfer.transferId,
      receiverChannelAddress: data.channelAddress,
      routingId: data.transfer?.meta?.routingId,
    },
    "Method started",
  );
  logger.debug({ methodId, method, data }, "Handling event");
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
      new ForwardTransferResolutionError(
        ForwardTransferResolutionError.reasons.IncomingChannelNotFound,
        routingId,
        "",
        "",
        channelAddress,
        transferId,
        {
          getChannelError: transfersRes.getError()!.toJson(),
        },
      ),
    );
  }

  // find transfer where node is responder
  const incomingTransfer = transfersRes.getValue().find((transfer) => transfer.responder === routerSignerAddress);

  if (!incomingTransfer) {
    return Result.fail(
      new ForwardTransferResolutionError(
        ForwardTransferResolutionError.reasons.IncomingChannelNotFound,
        routingId,
        "",
        "",
        channelAddress,
        transferId,
      ),
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
  logger.info(
    {
      method,
      methodId,
      transferResolver,
      senderTransferId: incomingTransfer.transferId,
      senderChannelAddress: incomingTransfer.channelAddress,
      routingId,
    },
    "Forwarding resolution",
  );
  const resolution = await nodeService.resolveTransfer(resolveParams);
  if (resolution.isError) {
    logger.warn(
      {
        method,
        methodId,
        error: jsonifyError(resolution.getError()!),
        routingId,
        senderTransferId: incomingTransfer.transferId,
        senderChannelAddress: incomingTransfer.channelAddress,
      },
      "Failed to forward resolution, queueing",
    );
    // Store the transfer, retry later
    const type = RouterUpdateType.TRANSFER_RESOLUTION;
    await store.queueUpdate(incomingTransfer.channelAddress, type, resolveParams);
    return Result.fail(
      new ForwardTransferResolutionError(
        ForwardTransferResolutionError.reasons.ErrorResolvingTransfer,
        routingId,
        incomingTransfer.channelAddress,
        incomingTransfer.transferId,
        channelAddress,
        transferId,
        {
          resolutionError: jsonifyError(resolution.getError()!),
          transferResolver,
        },
      ),
    );
  }

  logger.info({ method, methodId }, "Method complete");
  return Result.ok({
    ...resolution.getValue(),
    assetId: incomingTransfer.assetId,
  });
}

export async function handleIsAlive(
  data: IsAlivePayload,
  routerPublicIdentifier: string,
  signerAddress: string,
  nodeService: INodeService,
  store: IRouterStore,
  chainReader: IVectorChainReader,
  logger: BaseLogger,
): Promise<Result<undefined, CheckInError>> {
  const method = "handleIsAlive";
  const methodId = getRandomBytes32();
  logger.info(
    {
      method,
      methodId,
      routerPublicIdentifier,
      routerSignerAddress: signerAddress,
      channelAddress: data.channelAddress,
    },
    "Method started",
  );
  logger.info({ method, methodId, event: data }, "Handling event");

  if (data.skipCheckIn) {
    logger.info({ method, methodId, channelAddress: data.channelAddress }, "Skipping isAlive handler");
    return Result.ok(undefined);
  }

  const pending = await handlePendingUpdates(data, routerPublicIdentifier, nodeService, store, chainReader, logger);

  const unverified = await handleUnverifiedUpdates(
    data,
    routerPublicIdentifier,
    nodeService,
    store,
    chainReader,
    logger,
  );

  // TODO: should this be done IFF the processing pending updates doesnt fail?
  const dropped = await handleRouterDroppedTransfers(
    data,
    routerPublicIdentifier,
    nodeService,
    store,
    chainReader,
    logger,
  );

  const errors = [pending.getError(), unverified.getError()].filter((x) => !!x);
  if (errors.length === 0) {
    return Result.ok(undefined);
  }
  return Result.fail(
    new CheckInError(CheckInError.reasons.TasksFailed, data.channelAddress, {
      pending: pending.isError ? jsonifyError(pending.getError()!) : undefined,
      unverified: unverified.isError ? jsonifyError(unverified.getError()!) : undefined,
    }),
  );
}

// This function handles transfers that are dropped by the router
// eg. router is restarted to change config or to update software
// and transfers that were being processed were not properly
// checkpointed
const handleRouterDroppedTransfers = async (
  data: IsAlivePayload,
  routerPublicIdentifier: string,
  nodeService: INodeService,
  store: IRouterStore,
  chainReader: IVectorChainReader,
  logger: BaseLogger,
): Promise<Result<undefined, CheckInError>> => {
  const method = "handleRouterDroppedUpdates";
  const methodId = getRandomBytes32();
  logger.debug(
    {
      method,
      methodId,
      routerPublicIdentifier,
      channelAddress: data.channelAddress,
    },
    "Method started",
  );

  // Get the channel
  const channelRes = await nodeService.getStateChannel({ channelAddress: data.channelAddress });
  if (channelRes.isError || !channelRes.getValue()) {
    // Do not proceed with processing updates
    return Result.fail(
      new CheckInError(CheckInError.reasons.CouldNotGetChannel, data.channelAddress, {
        getChannelError: channelRes.isError ? channelRes.getError()?.message : "Channel not found",
      }),
    );
  }
  const channel = channelRes.getValue() as FullChannelState;

  // Get all active transfers for the channel
  const active = await nodeService.getActiveTransfers({ channelAddress: data.channelAddress });
  if (active.isError) {
    // Do not proceed with processing updates
    return Result.fail(
      new CheckInError(CheckInError.reasons.CouldNotGetActiveTransfers, data.channelAddress, {
        getChannelError: jsonifyError(active.getError()!),
      }),
    );
  }

  // We are processing any transfers we may need to forward, so include
  // only transfers where router must route, it is *not* a withdrawal,
  // *and* the transfer isnt currently being forwarded
  const withdrawInfo = await chainReader.getRegisteredTransferByName(
    TransferNames.Withdraw,
    channel.networkContext.transferRegistryAddress,
    channel.networkContext.chainId,
  );
  if (withdrawInfo.isError) {
    return Result.fail(
      new CheckInError(CheckInError.reasons.CouldNotGetRegistryInfo, data.channelAddress, {
        registryError: jsonifyError(withdrawInfo.getError()!),
      }),
    );
  }
  const { definition } = withdrawInfo.getValue();
  const relevant = active.getValue().filter((t) => {
    if (t.responderIdentifier !== routerPublicIdentifier) {
      return false;
    }
    if (getAddress(t.transferDefinition) === getAddress(definition)) {
      return false;
    }
    // valid routing meta
    const validate = ajv.compile(RouterSchemas.RouterMeta);
    const valid = validate(t.meta);
    if (!valid) {
      return false;
    }
    // not being currently processed
    if ((inProgressCreations[data.channelAddress] ?? []).includes(t.transferId)) {
      return false;
    }
    return true;
  });

  const errors: VectorErrorJson[] = [];
  for (const transfer of relevant) {
    // Get the receiver transfer
    const transfersByRoutingId = await nodeService.getTransfersByRoutingId({ routingId: transfer.meta.routingId });
    if (transfersByRoutingId.isError) {
      errors.push(jsonifyError(transfersByRoutingId.getError()!));
      continue;
    }
    const receiverTransfer = transfersByRoutingId
      .getValue()
      .find((t) => t.initiatorIdentifier === routerPublicIdentifier);

    // If the receiver transfer is created and not resolved, do nothing
    if (receiverTransfer && !receiverTransfer.transferResolver) {
      continue;
    }

    // If the receiver transfer is created && resolved, resolve the
    // sender transfer
    if (receiverTransfer && receiverTransfer.transferResolver) {
      const resolve = await nodeService.resolveTransfer({
        transferId: transfer.transferId,
        channelAddress: transfer.channelAddress,
        transferResolver: receiverTransfer.transferResolver,
      });
      if (resolve.isError) {
        errors.push(jsonifyError(resolve.getError()!));
      }
      continue;
    }

    // Receiver transfer is not created, cancel sender or
    // queue receiver transfer creation
    if (transfer.meta.requireOnline) {
      // cancel sender transfer because router was not online
      // so we cannot guarantee this condition
      const cancel = await cancelCreatedTransfer(
        "Router not online",
        transfer,
        routerPublicIdentifier,
        nodeService,
        store,
        logger,
        "", // receiverChannelAddress (not needed)
        true,
      );
      if (cancel.isError) {
        errors.push(jsonifyError(cancel.getError()!));
      }
      continue;
    }

    // Before creating transfer with receiver, make sure the
    // creation is not already queued to avoid a router double spend
    const receiverChannel = await nodeService.getStateChannelByParticipants({
      publicIdentifier: routerPublicIdentifier,
      counterparty: transfer.meta.path[0].recipient,
      chainId: transfer.meta.path[0].chainId,
    });
    if (receiverChannel.isError || !receiverChannel.getValue()) {
      errors.push(
        receiverChannel.isError
          ? jsonifyError(receiverChannel.getError()!)
          : jsonifyError(
              new CheckInError(CheckInError.reasons.CouldNotGetChannel, "", {
                senderChannel: channel.channelAddress,
                senderTransfer: transfer,
              }),
            ),
      );
      continue;
    }
    // Do not process if *any* updates exist for this routing id
    const updates = await store.getQueuedUpdates(receiverChannel.getValue()!.channelAddress, [
      RouterUpdateStatus.FAILED,
      RouterUpdateStatus.COMPLETE,
      RouterUpdateStatus.PENDING,
      RouterUpdateStatus.PROCESSING,
      RouterUpdateStatus.UNVERIFIED,
    ]);
    const receiverUpdate = updates.find(
      (u) =>
        u.payload.meta &&
        u.payload.meta.routingId === transfer.meta.routingId &&
        u.type === RouterUpdateType.TRANSFER_CREATION,
    );
    if (receiverUpdate) {
      // recipient update is already queued or being, do nothing
      continue;
    }
    // proceed to create or queue receiver transfer
    const assetIdx = channel.assetIds.findIndex((a) => getAddress(a) === getAddress(transfer.assetId));
    // Add to processing
    inProgressCreations[data.channelAddress] = [
      ...(inProgressCreations[data.channelAddress] ?? []),
      transfer.transferId,
    ];
    const forwardRes = await forwardTransferCreation(
      {
        aliceIdentifier: channel.aliceIdentifier,
        bobIdentifier: channel.bobIdentifier,
        channelAddress: channel.channelAddress,
        channelBalance: channel.balances[assetIdx],
        conditionType: transfer.transferDefinition,
        transfer,
      },
      routerPublicIdentifier,
      getSignerAddressFromPublicIdentifier(routerPublicIdentifier),
      nodeService,
      store,
      logger,
      chainReader,
    );
    // Remove from processing
    inProgressCreations[data.channelAddress] = inProgressCreations[data.channelAddress].filter(
      (t) => t !== transfer.transferId,
    );
    if (forwardRes.isError) {
      errors.push(forwardRes.getError()!);
    }
  }
  if (errors.length === 0) {
    return Result.ok(undefined);
  }
  return Result.fail(new CheckInError(CheckInError.reasons.RouterCleanupFailed, channel.channelAddress, { errors }));
};

// This should handle updates where a single-signed update creating
// the transfer with a recipient was generated, but the router does
// not know whether or not the transfer was installed or should be
// cancelled with the sender
const handleUnverifiedUpdates = async (
  data: IsAlivePayload,
  routerPublicIdentifier: string,
  nodeService: INodeService,
  store: IRouterStore,
  chainReader: IVectorChainReader,
  logger: BaseLogger,
): Promise<Result<undefined, CheckInError>> => {
  const method = "handleUnverifiedUpdates";
  const methodId = getRandomBytes32();
  logger.debug(
    {
      method,
      methodId,
      routerPublicIdentifier,
      channelAddress: data.channelAddress,
    },
    "Method started",
  );

  // Get all unverified updates
  const updates = await store.getQueuedUpdates(data.channelAddress, [RouterUpdateStatus.UNVERIFIED]);

  // Get the channel (if needed, should only query 1x for it)
  const channelRes = await nodeService.getStateChannel({ channelAddress: data.channelAddress });
  if (channelRes.isError || !channelRes.getValue()) {
    // Do not proceed with processing updates
    return Result.fail(
      new CheckInError(CheckInError.reasons.CouldNotGetChannel, data.channelAddress, {
        getChannelError: channelRes.getError()?.message,
      }),
    );
  }
  const channel = channelRes.getValue() as FullChannelState;

  const erroredUpdates: RouterStoredUpdate<any>[] = [];
  const handleUpdateErr = async (update: RouterStoredUpdate<any>, msg: string, context: any = {}) => {
    logger.error({ update, ...context }, msg);
    await store.setUpdateStatus(update.id, RouterUpdateStatus.FAILED, msg);
    erroredUpdates.push(update);
  };
  for (const update of updates) {
    if (update.type !== RouterUpdateType.TRANSFER_CREATION) {
      await handleUpdateErr(update, "Can't verify non-create updates");
      continue;
    }

    await store.setUpdateStatus(update.id, RouterUpdateStatus.PROCESSING);
    logger.info({ method, methodId, updateType: update.type, updateId: update.id }, "Processing unverified update");

    // First, reconcile deposit on the channel to come to consensus on the
    // merkle root
    const reconcile = await nodeService.reconcileDeposit({
      publicIdentifier: routerPublicIdentifier,
      channelAddress: data.channelAddress,
      assetId: AddressZero,
    });
    if (reconcile.isError) {
      await handleUpdateErr(update, "Could not reconcile deposit", {
        reconcileError: jsonifyError(reconcile.getError()!),
      });
      continue;
    }

    // If transfer was created (included in root), mark update as processed
    // and continue
    const routingId = (update as RouterStoredUpdate<"TRANSFER_CREATION">).payload.meta?.routingId;
    const requireOnline = update.payload.meta?.requireOnline ?? false;
    if (!routingId) {
      await handleUpdateErr(update, "No routingId in update.payload.meta");
      continue;
    }
    const transfers = await nodeService.getTransfersByRoutingId({
      routingId,
      publicIdentifier: routerPublicIdentifier,
    });
    if (transfers.isError) {
      await handleUpdateErr(update, "Could not get transfers by routingId", {
        routingId,
        transfersError: jsonifyError(transfers.getError()!),
      });
      continue;
    }
    const receiverTransfer = transfers.getValue().find((t) => {
      return t.initiatorIdentifier === routerPublicIdentifier;
    });
    if (receiverTransfer) {
      await store.setUpdateStatus(
        update.id,
        RouterUpdateStatus.COMPLETE,
        "Update verified: receiver installed transfer",
      );
      logger.info({ method, methodId, update: update.id }, "Update verified: receiver installed transfer");
      continue;
    }

    // If the transfer was not created:
    // - forward receiver transfer if transfer.meta.requireOnline == false
    // - cancel sender transfer if the transfer.meta.requireOnline == true
    if (!requireOnline) {
      // Retry creating receiver transfer
      const createRes = await transferWithCollateralization(
        update.payload as NodeParams.ConditionalTransfer,
        channel,
        routerPublicIdentifier,
        nodeService,
        chainReader,
        logger,
      );
      if (createRes.isError) {
        await handleUpdateErr(update, "Failed to create with receiver", {
          createError: jsonifyError(createRes.getError()!),
        });
        continue;
      }
      logger.info({ method, methodId, update: update.id }, "Update verified: receiver transfer created");
      continue;
    }

    // cancel sender transfer
    const senderTransfer = transfers.getValue().find((t) => {
      return t.responderIdentifier === routerPublicIdentifier;
    });
    if (!senderTransfer) {
      await handleUpdateErr(update, "No sender transfer to cancel", {
        transfers,
      });
      continue;
    }

    const cancelRes = await cancelCreatedTransfer(
      "Receiver offline",
      senderTransfer,
      routerPublicIdentifier,
      nodeService,
      store,
      logger,
      data.channelAddress,
      {},
      true, // sender transfer cancellation queued
    );
    // the receiver update was handled successfully, and the sender
    // update was enqueued if failed. So remove the update from pending
    if (cancelRes.isError) {
      logger.warn(
        { cancelError: jsonifyError(cancelRes.getError()!) },
        "Update verified: could not cancel sender transfer, cancellation enqueued",
      );
    }
    await store.setUpdateStatus(
      update.id,
      RouterUpdateStatus.COMPLETE,
      "Update verified: receiver transfer not installed, sender cancelled",
    );
    logger.info(
      { method, methodId, update: update.id },
      "Update verified: receiver transfer not installed, sender cancelled",
    );
    continue;
  }
  if (erroredUpdates.length > 0) {
    logger.error({ method, methodId, erroredUpdates }, "Failed to handle updates");
    return Result.fail(
      new CheckInError(CheckInError.reasons.UpdatesFailed, data.channelAddress, {
        failedIds: erroredUpdates.map((update) => update.id),
      }),
    );
  }

  return Result.ok(undefined);
};

const handlePendingUpdates = async (
  data: IsAlivePayload,
  routerPublicIdentifier: string,
  nodeService: INodeService,
  store: IRouterStore,
  chainReader: IVectorChainReader,
  logger: BaseLogger,
): Promise<Result<undefined, CheckInError>> => {
  const method = "handlePendingUpdates";
  const methodId = getRandomBytes32();
  logger.debug(
    {
      method,
      methodId,
      routerPublicIdentifier,
      channelAddress: data.channelAddress,
    },
    "Method started",
  );
  // This means the user is online and has checked in. Get all updates that are
  // queued and then execute them.
  const updates = await store.getQueuedUpdates(data.channelAddress, [RouterUpdateStatus.PENDING]);

  // Get the channel (if needed, should only query 1x for it)
  const channelRes = await nodeService.getStateChannel({ channelAddress: data.channelAddress });
  if (channelRes.isError || !channelRes.getValue()) {
    // Do not proceed with processing updates
    return Result.fail(
      new CheckInError(CheckInError.reasons.CouldNotGetChannel, data.channelAddress, {
        getChannelError: channelRes.getError()?.message,
      }),
    );
  }
  const channel = channelRes.getValue() as FullChannelState;

  const erroredUpdates = [];
  for (const routerUpdate of updates) {
    // set status to processing to avoid race conditions
    await store.setUpdateStatus(routerUpdate.id, RouterUpdateStatus.PROCESSING);
    logger.info({ method, methodId, updateType: routerUpdate.type, updateId: routerUpdate.id }, "Processing update");
    logger.debug({ method, methodId, update: routerUpdate }, "Update details");
    const { type, payload } = routerUpdate;

    // Handle transfer creation updates
    if (type === RouterUpdateType.TRANSFER_CREATION) {
      // NOTE: this will *NOT* perform any additional liveness checks
      // and it is assumed the receiver will stay online throughout the
      // processing of these updates
      const createRes = await transferWithCollateralization(
        payload as NodeParams.ConditionalTransfer,
        channel,
        routerPublicIdentifier,
        nodeService,
        chainReader,
        logger,
      );
      if (createRes.isError) {
        logger.error(
          { method, methodId, transferError: jsonifyError(createRes.getError()!), update: routerUpdate },
          "Handling update failed",
        );
        const error = createRes.getError()?.context?.transferError;
        await store.setUpdateStatus(
          routerUpdate.id,
          error === NodeError.reasons.Timeout ? RouterUpdateStatus.PENDING : RouterUpdateStatus.FAILED,
          error,
        );
        erroredUpdates.push(routerUpdate);
      } else {
        await store.setUpdateStatus(
          routerUpdate.id,
          RouterUpdateStatus.COMPLETE,
          "Update complete: forwarded transfer creation",
        );
        logger.info({ method, methodId, updateId: routerUpdate.id }, "Successfully handled checkIn update");
      }
      continue;
    }

    // Handle transfer resolution updates
    if (type !== RouterUpdateType.TRANSFER_RESOLUTION) {
      logger.error({ update: routerUpdate }, "Unknown update type");
      await store.setUpdateStatus(routerUpdate.id, RouterUpdateStatus.FAILED, "Unknown update type");
      continue;
    }
    const resolveRes = await nodeService.resolveTransfer(payload as NodeParams.ResolveTransfer);
    // If failed, retry later
    if (resolveRes.isError) {
      logger.error(
        { method, methodId, resolveError: jsonifyError(resolveRes.getError()!), update: routerUpdate },
        "Handling update failed",
      );
      const error = resolveRes.getError()?.message;
      await store.setUpdateStatus(
        routerUpdate.id,
        error === NodeError.reasons.Timeout ? RouterUpdateStatus.PENDING : RouterUpdateStatus.FAILED,
        error,
      );
      erroredUpdates.push(routerUpdate);
    } else {
      await store.setUpdateStatus(
        routerUpdate.id,
        RouterUpdateStatus.COMPLETE,
        "Update complete: forwarded transfer resolution",
      );
      logger.info({ method, methodId, updateId: routerUpdate.id }, "Successfully handled update");
    }
  }
  if (erroredUpdates.length > 0) {
    logger.error({ method, methodId, erroredUpdates }, "Failed to handle updates");
    return Result.fail(
      new CheckInError(CheckInError.reasons.UpdatesFailed, data.channelAddress, {
        failedIds: erroredUpdates.map((update) => update.id),
      }),
    );
  }
  logger.info({ method, methodId }, "Method complete");
  return Result.ok(undefined);
};
