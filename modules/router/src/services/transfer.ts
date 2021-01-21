import {
  FullChannelState,
  FullTransferState,
  INodeService,
  IVectorChainReader,
  NodeParams,
  NodeResponses,
  Result,
  jsonifyError,
} from "@connext/vector-types";
import { decodeTransferResolver, getRandomBytes32, ServerNodeServiceError } from "@connext/vector-utils";
import { BaseLogger } from "pino";

import { ForwardTransferCreationError, ForwardTransferCreationErrorContext } from "../errors";

import { justInTimeCollateral } from "./collateral";
import { IRouterStore, RouterUpdateType } from "./store";

/**
 * Will check liveness and queue transfer if recipient is not online.
 * Used when forwarding transfers, NOT during checkIn
 */
export const attemptTransferWithCollateralization = async (
  params: NodeParams.ConditionalTransfer,
  recipientChannel: FullChannelState,
  routerPublicIdentifier: string,
  nodeService: INodeService,
  store: IRouterStore,
  chainReader: IVectorChainReader,
  logger: BaseLogger,
  requireOnline = true,
  errorContext?: ForwardTransferCreationErrorContext,
): Promise<Result<NodeResponses.ConditionalTransfer | undefined, ForwardTransferCreationError>> => {
  const method = "attemptTransferWithCollateralization";
  const methodId = getRandomBytes32();
  logger.debug(
    { method, methodId, transferParams: params, channelAddress: recipientChannel.channelAddress },
    "Method started",
  );
  // NOTE: collateralizing takes a long time, so the liveness check may
  // not hold for the transfer even if it works here. instead, should
  // check for liveness post-collateral attempt and queue then. (this is
  // ok depsite the potential 2 timeouts because nobody is waiting on the
  // completion of these functions)

  // collateralize if needed
  const collateralRes = await justInTimeCollateral(
    recipientChannel,
    params.assetId,
    routerPublicIdentifier,
    nodeService,
    chainReader,
    logger,
    params.amount,
  );
  const collateralError = collateralRes.getError();
  if (collateralRes.isError) {
    logger.error({ method, methodId, error: jsonifyError(collateralError!) }, "Failed to collateralize");
  }

  // Get error context
  const { routingId, senderChannel, senderTransfer } = errorContext ?? {};

  // If it failed to collateralize, return a failure if the payment
  // requires that the recipient is online. (offline collateral failures
  // handled after queueing/availability checks)
  if (collateralError && requireOnline) {
    return Result.fail(
      new ForwardTransferCreationError(
        ForwardTransferCreationError.reasons.UnableToCollateralize,
        routingId,
        senderChannel,
        senderTransfer,
        recipientChannel.channelAddress,
        {
          params,
          shouldCancelSender: true,
          collateralError: jsonifyError(collateralError),
        },
      ),
    );
  }

  // check if recipient is available
  let available = false;
  try {
    const online = await nodeService.sendIsAliveMessage({
      channelAddress: params.channelAddress,
      skipCheckIn: true,
    });
    available = !online.isError;
  } catch (e) {
    logger.warn(
      { method, methodId, error: e.message, routingId: routingId ?? params.meta?.routingId },
      "Failed to ping recipient",
    );
  }

  // if offline, and require online, fail payment
  if (!available && requireOnline) {
    return Result.fail(
      new ForwardTransferCreationError(
        ForwardTransferCreationError.reasons.ReceiverOffline,
        routingId,
        senderChannel,
        senderTransfer,
        recipientChannel.channelAddress,
        {
          shouldCancelSender: true,
          params,
        },
      ),
    );
  }

  // if offline and offline payment, queue creation
  if (!available && !requireOnline) {
    logger.warn(
      {
        method,
        methodId,
        channelAddress: recipientChannel.channelAddress,
        routingId: routingId ?? params.meta?.routingId,
      },
      "Receiver offline, queueing transfer",
    );
    try {
      await store.queueUpdate(recipientChannel.channelAddress, RouterUpdateType.TRANSFER_CREATION, params);
    } catch (e) {
      // Handle queue failure
      return Result.fail(
        new ForwardTransferCreationError(
          ForwardTransferCreationError.reasons.ErrorQueuingReceiverUpdate,
          routingId,
          senderChannel,
          senderTransfer,
          recipientChannel.channelAddress,
          {
            storeError: e.message,
            shouldCancelSender: true,
            params,
          },
        ),
      );
    }
    // return undefined to show transfer queued
    return Result.ok(undefined);
  }

  // if available, but collateralizing failed, return failure
  // NOTE: this check is performed *after* queueing update to
  // ensure that offline collateral failures are discarded in
  // the case where the receiver is online (but the payment doesnt
  // explicitly require it)
  if (available && collateralError) {
    // NOTE: should always cancel the sender payment in this case
    return Result.fail(
      new ForwardTransferCreationError(
        ForwardTransferCreationError.reasons.UnableToCollateralize,
        routingId,
        senderChannel,
        senderTransfer,
        recipientChannel.channelAddress,
        {
          params,
          shouldCancelSender: true,
          collateralError: jsonifyError(collateralError),
        },
      ),
    );
  }

  // safe to create transfer
  const transfer = await nodeService.conditionalTransfer(params);
  logger.debug({ method, methodId }, "Method complete");
  return transfer.isError
    ? Result.fail(
        new ForwardTransferCreationError(
          ForwardTransferCreationError.reasons.ErrorForwardingTransfer,
          routingId,
          senderChannel,
          senderTransfer,
          recipientChannel.channelAddress,
          {
            transferError: jsonifyError(transfer.getError()!),
            // if its a timeout, could be withholding sig, so do not cancel
            // sender transfer
            shouldCancelSender: false,
            params,
          },
        ),
      )
    : (transfer as Result<NodeResponses.ConditionalTransfer>);
};

/**
 * Will transfer + collateralize if needed to handle payment. Does
 * NOT check liveness, and does NOT queue updates. (Used in during
 * counterparty checkIn)
 */
export const transferWithCollateralization = async (
  params: NodeParams.ConditionalTransfer,
  channel: FullChannelState,
  routerPublicIdentifier: string,
  nodeService: INodeService,
  chainReader: IVectorChainReader,
  logger: BaseLogger,
  errorContext?: ForwardTransferCreationErrorContext,
): Promise<Result<NodeResponses.ConditionalTransfer | undefined, ForwardTransferCreationError>> => {
  const method = "transferWithCollateralization";
  const methodId = getRandomBytes32();
  logger.debug({ method, methodId, transferParams: params, channelAddress: channel.channelAddress }, "Method started");
  // collateralize if needed
  const collateralRes = await justInTimeCollateral(
    channel,
    params.assetId,
    routerPublicIdentifier,
    nodeService,
    chainReader,
    logger,
    params.amount,
  );

  // Get error context
  const { routingId, senderChannel, senderTransfer } = errorContext ?? {};

  if (collateralRes.isError) {
    return Result.fail(
      new ForwardTransferCreationError(
        ForwardTransferCreationError.reasons.UnableToCollateralize,
        routingId,
        senderChannel,
        senderTransfer,
        channel.channelAddress,
        {
          ...params,
          collateralError: jsonifyError(collateralRes.getError()!),
        },
      ),
    );
  }

  // attempt to transfer
  // NOTE: as soon as you try to create a transfer with the receiver,
  // you CANNOT cancel the sender transfer until it has expired.
  const transfer = await nodeService.conditionalTransfer(params);
  logger.debug({ method, methodId, transferParams: params, channelAddress: channel.channelAddress }, "Method complete");
  return transfer.isError
    ? Result.fail(
        new ForwardTransferCreationError(
          ForwardTransferCreationError.reasons.ErrorForwardingTransfer,
          routingId,
          senderChannel,
          senderTransfer,
          channel.channelAddress,
          {
            transferError: jsonifyError(transfer.getError()!),
            ...params,
          },
        ),
      )
    : (transfer as Result<NodeResponses.ConditionalTransfer>);
};

// Will return undefined IFF properly enqueued
export const cancelCreatedTransfer = async (
  cancellationReason: string,
  toCancel: FullTransferState,
  routerPublicIdentifier: string,
  nodeService: INodeService,
  store: IRouterStore,
  logger: BaseLogger,
  receiverChannel = "",
  context: any = {},
  enqueue = true,
): Promise<Result<NodeResponses.ResolveTransfer | undefined, ForwardTransferCreationError>> => {
  const method = "cancelCreatedTransfer";
  const methodId = getRandomBytes32();
  logger.debug(
    { method, methodId, cancellationReason, transferId: toCancel.transferId, channelAddress: toCancel.channelAddress },
    "Method started",
  );
  const transferResolverRes = await nodeService.getRegisteredTransfers({
    chainId: toCancel.chainId,
    publicIdentifier: routerPublicIdentifier,
  });
  if (transferResolverRes.isError) {
    return Result.fail(
      new ForwardTransferCreationError(
        ForwardTransferCreationError.reasons.FailedToCancelSenderTransfer,
        toCancel.meta.routingId,
        toCancel.channelAddress,
        toCancel.transferId,
        receiverChannel,
        {
          cancellationError: jsonifyError(transferResolverRes.getError()!),
          senderTransfer: toCancel.transferId,
          cancellationReason,
          ...context,
        },
      ),
    );
  }

  // First, get the cancelling resolver for the transfer
  const { encodedCancel, resolverEncoding } =
    transferResolverRes.getValue().find((t) => t.definition === toCancel.transferDefinition) ?? {};
  if (!encodedCancel || !resolverEncoding) {
    return Result.fail(
      new ForwardTransferCreationError(
        ForwardTransferCreationError.reasons.FailedToCancelSenderTransfer,
        toCancel.meta.routingId,
        toCancel.channelAddress,
        toCancel.transferId,
        receiverChannel,
        {
          cancellationError: "Sender transfer not in registry info",
          cancellationReason,
          transferDefinition: toCancel.transferDefinition,
          registered: transferResolverRes.getValue().map((t) => t.definition),
          ...context,
        },
      ),
    );
  }

  // Attempt to resolve with cancellation reason, otherwise
  // Resolve the sender transfer
  const resolveParams: NodeParams.ResolveTransfer = {
    publicIdentifier: routerPublicIdentifier,
    channelAddress: toCancel.channelAddress,
    transferId: toCancel.transferId,
    transferResolver: decodeTransferResolver(encodedCancel, resolverEncoding),
    meta: {
      cancellationReason,
      cancellationContext: { ...context },
    },
  };
  logger.debug({ method, methodId, params: resolveParams }, "Created cancelling params");
  const resolveResult = await nodeService.resolveTransfer(resolveParams);
  if (!resolveResult.isError) {
    logger.debug({ method, methodId }, "Method complete");
    return resolveResult as Result<NodeResponses.ResolveTransfer>;
  }
  // Failed to cancel sender side payment
  if (enqueue && resolveResult.getError()!.message === ServerNodeServiceError.reasons.Timeout) {
    try {
      await store.queueUpdate(toCancel.channelAddress, RouterUpdateType.TRANSFER_RESOLUTION, resolveParams);
      logger.warn({ methodId, method, params: resolveParams }, "Cancellation enqueued");
      return Result.ok(undefined);
    } catch (e) {
      logger.error({ method, methodId, error: e.message }, "Failed to enqueue transfer");
      context.queueError = e.message;
    }
  }
  return Result.fail(
    new ForwardTransferCreationError(
      ForwardTransferCreationError.reasons.FailedToCancelSenderTransfer,
      toCancel.meta.routingId,
      toCancel.channelAddress,
      toCancel.transferId,
      receiverChannel,
      {
        cancellationError: jsonifyError(resolveResult.getError()!),
        cancellationReason,
        ...context,
      },
    ),
  );
};
