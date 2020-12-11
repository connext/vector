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
} from "@connext/vector-types";
import { getBalanceForAssetId } from "@connext/vector-utils";
import { BaseLogger } from "pino";
import { BigNumber } from "@ethersproject/bignumber";

import { getSwappedAmount } from "./services/swap";
import { IRouterStore } from "./services/store";
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
    UnableToCollateralize: "Could not collateralize receiver channel",
    InvalidTransferDefinition: "Could not find transfer definition",
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
  signerAddress: string,
  nodeService: INodeService,
  store: IRouterStore,
  logger: BaseLogger,
  chainProviders: ChainJsonProviders,
): Promise<Result<any, ForwardTransferError>> {
  const method = "forwardTransferCreation";
  logger.error(
    { data, method, node: { signerAddress, routerPublicIdentifier } },
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

  const {
    transfer: {
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
    },
    conditionType,
  } = data;
  const meta = { ...untypedMeta } as RouterSchemas.RouterMeta & any;
  const { routingId } = meta;
  const [path] = meta.path;

  const recipientIdentifier = path.recipient;

  const senderChannelRes = await nodeService.getStateChannel({
    channelAddress: senderChannelAddress,
    publicIdentifier: routerPublicIdentifier,
  });
  if (senderChannelRes.isError) {
    return Result.fail(
      new ForwardTransferError(
        ForwardTransferError.reasons.SenderChannelNotFound,
        senderChannelRes.getError()?.message,
      ),
    );
  }
  const senderChannel = senderChannelRes.getValue() as FullChannelState;
  if (!senderChannel) {
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
      return Result.fail(
        new ForwardTransferError(ForwardTransferError.reasons.UnableToCalculateSwap, {
          message: swapRes.getError()?.message,
          context: swapRes.getError()?.context,
        }),
      );
    }
    recipientAmount = swapRes.getValue();

    logger.warn(
      {
        method,
        recipientAssetId,
        recipientAmount,
        recipientChainId,
        senderTransferDefinition,
        conditionType,
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
    return Result.fail(
      new ForwardTransferError(
        ForwardTransferError.reasons.RecipientChannelNotFound,
        recipientChannelRes.getError()?.message,
      ),
    );
  }
  const recipientChannel = recipientChannelRes.getValue();
  if (!recipientChannel) {
    return Result.fail(
      new ForwardTransferError(ForwardTransferError.reasons.RecipientChannelNotFound, {
        participants: [routerPublicIdentifier, recipientIdentifier],
        chainId: recipientChainId,
      }),
    );
  }

  const routerBalance = getBalanceForAssetId(
    recipientChannel as FullChannelState,
    recipientAssetId,
    routerPublicIdentifier === recipientChannel.aliceIdentifier ? "alice" : "bob",
  );

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
    if (requestCollateralRes.isError) {
      return Result.fail(
        new ForwardTransferError(ForwardTransferError.reasons.UnableToCollateralize, {
          message: requestCollateralRes.getError()?.message,
          context: requestCollateralRes.getError()?.context,
        }),
      );
    }
  }

  // If the above is not the case, we can make the transfer!

  // Create the initial  state of the transfer by updating the
  // `to` in the balance field
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
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
      senderIdentifier:
        initiator === senderChannel.bobIdentifier ? senderChannel.bobIdentifier : senderChannel.aliceIdentifier,
      ...meta,
    },
  };
  const transfer = await nodeService.conditionalTransfer(params);
  if (transfer.isError) {
    if (!requireOnline && transfer.getError()?.message === NodeError.reasons.Timeout) {
      // store transfer
      const type = "TransferCreation";
      await store.queueUpdate(type, {
        channelAddress: params.channelAddress,
        amount: params.amount,
        assetId: params.assetId,
        routingId,
        type: params.type,
        details,
      });
    }
    return Result.fail(
      new ForwardTransferError(ForwardTransferError.reasons.ErrorForwardingTransfer, {
        message: transfer.getError()?.message,
        ...(transfer.getError()!.context ?? {}),
      }),
    );
  }

  return Result.ok(transfer.getValue());
}

export async function forwardTransferResolution(
  data: ConditionalTransferResolvedPayload,
  publicIdentifier: string,
  signerAddress: string,
  service: INodeService,
  store: IRouterStore,
  logger: BaseLogger,
): Promise<Result<undefined | NodeResponses.ResolveTransfer, ForwardResolutionError>> {
  const method = "forwardTransferResolution";
  logger.info(
    { data, method, node: { signerAddress, publicIdentifier } },
    "Received transfer resolution, starting forwarding",
  );
  const {
    channelAddress,
    transfer: { transferId, transferResolver, meta },
  } = data;
  const { routingId } = meta as RouterSchemas.RouterMeta;

  // Find the channel with the corresponding transfer to unlock
  const transfersRes = await service.getTransfersByRoutingId({ routingId, publicIdentifier });
  if (transfersRes.isError) {
    return Result.fail(
      new ForwardResolutionError(ForwardResolutionError.reasons.IncomingChannelNotFound, {
        routingId,
        error: transfersRes.getError()?.message,
      }),
    );
  }

  // find transfer where node is responder
  const incomingTransfer = transfersRes.getValue().find((transfer) => transfer.responder === signerAddress);

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
    publicIdentifier,
  };
  const resolution = await service.resolveTransfer(resolveParams);
  if (resolution.isError) {
    // Store the transfer, retry later
    // TODO: add logic to periodically retry resolving transfers
    const type = "TransferResolution";
    await store.queueUpdate(type, resolveParams);
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
  data: any,
  publicIdentifier: string,
  signerAddress: string,
  service: INodeService,
  store: IRouterStore,
) {
  // This means the user is online and has checked in. Get all updates that are queued and then execute them.
  // const updates = await store.getQueuedUpdates(data.channelAdress);
  // updates.forEach(async update => {
  //   if (update.type == "TransferCreation") {
  //     const { channelAddress, amount, assetId, paymentId, conditionData } = update.data;
  //     // TODO do we want to try catch this? What should happen if this fails?
  //     await node.conditionalTransfer(channelAddress, amount, assetId, paymentId, conditionData);
  //   } else if (update.type == "TransferResolution") {
  //     const { channelAddress, paymentId, resolverData } = update.data;
  //     // TODO same as above
  //     await node.resolveCondtion(channelAddress, paymentId, resolverData);
  //   }
  // });
}
