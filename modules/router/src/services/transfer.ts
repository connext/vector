import {
  FullChannelState,
  FullTransferState,
  INodeService,
  IVectorChainReader,
  NodeError,
  NodeParams,
  NodeResponses,
  Result,
} from "@connext/vector-types";
import { decodeTransferResolver, getBalanceForAssetId } from "@connext/vector-utils";
import { BigNumber } from "ethers";
import { BaseLogger } from "pino";

import { requestCollateral } from "../collateral";
import { ForwardTransferError } from "../errors";

import { IRouterStore, RouterUpdateType } from "./store";

export const transferWithAutoCollateralization = async (
  params: NodeParams.ConditionalTransfer,
  channel: FullChannelState,
  routerPublicIdentifier: string,
  nodeService: INodeService,
  store: IRouterStore,
  chainReader: IVectorChainReader,
  logger: BaseLogger,
  enqueue = true,
): Promise<Result<NodeResponses.ConditionalTransfer | undefined, ForwardTransferError>> => {
  // check if there is sufficient collateral
  const routerBalance = getBalanceForAssetId(
    channel,
    params.assetId,
    routerPublicIdentifier === channel.aliceIdentifier ? "alice" : "bob",
  );

  if (BigNumber.from(routerBalance).lt(params.amount)) {
    logger.info({ routerBalance, recipientAmount: params.amount }, "Requesting collateral to cover transfer");
    const requestCollateralRes = await requestCollateral(
      channel,
      params.assetId,
      routerPublicIdentifier,
      nodeService,
      chainReader,
      logger,
      undefined,
      params.amount,
    );

    if (requestCollateralRes.isError) {
      // Reconciling may fail if the recipient is offline, do not cancel
      return Result.fail(
        new ForwardTransferError(ForwardTransferError.reasons.UnableToCollateralize, {
          ...params,
          channelAddress: channel.channelAddress,
        }),
      );
    }
  }

  // attempt to transfer
  const transfer = await nodeService.conditionalTransfer(params);
  if (!transfer.isError) {
    return transfer as Result<NodeResponses.ConditionalTransfer>;
  }

  // error transferring
  if (!enqueue || transfer.getError()?.message !== NodeError.reasons.Timeout) {
    // do not enqueue transfer creation
    return Result.fail(
      new ForwardTransferError(ForwardTransferError.reasons.ErrorForwardingTransfer, { ...transfer.getError()! }),
    );
  }

  // queue the transfer creation
  try {
    await store.queueUpdate(channel.channelAddress, RouterUpdateType.TRANSFER_CREATION, params);
  } catch (e) {
    // Handle queue failure
    return Result.fail(
      new ForwardTransferError(ForwardTransferError.reasons.ErrorQueuingReceiverUpdate, {
        storeError: e.message,
        ...params,
      }),
    );
  }
  // return undefined to show transfer queued
  return Result.ok(undefined);
};

// Will return undefined IFF properly enqueued
export const cancelCreatedTransfer = async (
  cancellationReason: string,
  toCancel: FullTransferState,
  routerPublicIdentifier: string,
  nodeService: INodeService,
  store: IRouterStore,
  logger: BaseLogger,
  context: any = {},
  enqueue = true,
): Promise<Result<NodeResponses.ResolveTransfer | undefined, ForwardTransferError>> => {
  const transferResolverRes = await nodeService.getRegisteredTransfers({
    chainId: toCancel.chainId,
    publicIdentifier: routerPublicIdentifier,
  });
  if (transferResolverRes.isError) {
    return Result.fail(
      new ForwardTransferError(ForwardTransferError.reasons.FailedToCancelSenderTransfer, {
        cancellationError: transferResolverRes.getError()?.message,
        senderChannel: toCancel.channelAddress,
        senderTransfer: toCancel.transferId,
        cancellationReason,
        ...context,
      }),
    );
  }

  // First, get the cancelling resolver for the transfer
  const { encodedCancel, resolverEncoding } =
    transferResolverRes.getValue().find((t) => t.definition === toCancel.transferDefinition) ?? {};
  if (!encodedCancel || !resolverEncoding) {
    return Result.fail(
      new ForwardTransferError(ForwardTransferError.reasons.FailedToCancelSenderTransfer, {
        cancellationError: "Sender transfer not in registry info",
        senderChannel: toCancel.channelAddress,
        senderTransfer: toCancel.transferId,
        cancellationReason,
        transferDefinition: toCancel.transferDefinition,
        registered: transferResolverRes.getValue().map((t) => t.definition),
        ...context,
      }),
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
      cancellationContext: { transferId: toCancel.transferId, channel: toCancel.channelAddress },
    },
  };
  const resolveResult = await nodeService.resolveTransfer(resolveParams);
  if (!resolveResult.isError) {
    return resolveResult as Result<NodeResponses.ResolveTransfer>;
  }
  // Failed to cancel sender side payment
  if (enqueue) {
    try {
      await store.queueUpdate(toCancel.channelAddress, RouterUpdateType.TRANSFER_RESOLUTION, resolveParams);
      logger.warn({ ...resolveParams }, "Cancellation enqueued");
      return Result.ok(undefined);
    } catch (e) {
      logger.error({ error: e.message }, "Failed to enqueue transfer");
      context.queueError = e.message;
    }
  }
  return Result.fail(
    new ForwardTransferError(ForwardTransferError.reasons.FailedToCancelSenderTransfer, {
      cancellationError: resolveResult.getError()?.message,
      transferId: toCancel.transferId,
      channel: toCancel.channelAddress,
      cancellationReason,
      ...context,
    }),
  );
};
