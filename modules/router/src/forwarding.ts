import { EngineEvents, Result, Values, VectorError } from "@connext/vector-types";
import { BaseLogger } from "pino";
import { BigNumber } from "ethers";

import { getSwappedAmount } from "./services/swap";
import { IServerNodeService, ServerNodeError } from "./services/server-node";
import { getRebalanceProfile } from "./services/rebalance";

export class ForwardTransferError extends VectorError {
  readonly type = VectorError.errors.RouterError;

  static readonly reasons = {
    SenderChannelNotFound: "Sender channel not found",
    RecipientChannelNotFound: "Recipient channel not found",
    UnableToCalculateSwap: "Could not calculate swap",
    UnableToGetRebalanceProfile: "Could not get rebalance profile",
    ErrorForwardingTransfer: "Error forwarding transfer",
  } as const;

  constructor(
    public readonly message: Values<typeof ForwardTransferError.reasons>,
    // eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
    public readonly context?: any,
  ) {
    super(message, context);
  }
}

export async function forwardTransferCreation(
  data: any,
  node: IServerNodeService,
  store: any,
  logger: BaseLogger,
): Promise<Result<any, ForwardTransferError>> {
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
    senderAmount,
    senderAssetId,
    recipientChainId,
    recipientIdentifier,
    recipientAssetId,
    requireOnline,
    senderChannelAddress,
    conditionData,
    routingId,
    meta,
    conditionType,
  } = data;

  // TODO validate the above params

  const senderChannelRes = await node.getStateChannel(senderChannelAddress);
  if (senderChannelRes.isError) {
    return Result.fail(
      new ForwardTransferError(
        ForwardTransferError.reasons.SenderChannelNotFound,
        senderChannelRes.getError()?.message,
      ),
    );
  }
  const senderChannel = senderChannelRes.getValue();
  if (!senderChannel) {
    return Result.fail(
      new ForwardTransferError(ForwardTransferError.reasons.SenderChannelNotFound, {
        channelAddress: senderChannelAddress,
      }),
    );
  }
  const senderChainId = senderChannel.networkContext.chainId;

  // Below, we figure out the correct params needed for the receiver's channel. This includes
  // potential swaps/crosschain stuff
  let recipientAmount = senderAmount;
  if (recipientAssetId !== senderAssetId) {
    recipientAmount = await getSwappedAmount(
      senderAmount,
      senderAssetId,
      senderChainId,
      recipientAssetId,
      recipientChainId,
    );
  }

  // Next, get the recipient's channel and figure out whether it needs to be collateralized
  const recipientChannelRes = await node.getStateChannelByParticipants(
    node.publicIdentifier,
    recipientIdentifier,
    recipientChainId,
  );
  if (recipientChannelRes.isError) {
    return Result.fail(
      new ForwardTransferError(
        ForwardTransferError.reasons.SenderChannelNotFound,
        senderChannelRes.getError()?.message,
      ),
    );
  }
  const recipientChannel = recipientChannelRes.getValue();
  if (!recipientChannel) {
    return Result.fail(
      new ForwardTransferError(ForwardTransferError.reasons.SenderChannelNotFound, {
        channelAddress: senderChannelAddress,
      }),
    );
  }

  // TODO use a provider or service pattern here so we can unit test
  const profileRes = await getRebalanceProfile(recipientChannel.channelAddress, recipientAssetId);
  if (profileRes.isError) {
    return Result.fail(profileRes.getError()!);
  }

  const profile = profileRes.getValue();

  // Figure out router balance
  const routerBalanceInRecipientChannel =
    node.signerAddress == recipientChannel.participants[0]
      ? recipientChannel.balances[recipientAssetId].amount[0]
      : recipientChannel.balances[recipientAssetId].amount[1];

  // If there are not enough funds, fall back to sending the entire transfer amount + required collateral amount
  if (BigNumber.from(routerBalanceInRecipientChannel).lt(recipientAmount)) {
    // This means we need to collateralize this tx in-flight. To avoid having to rebalance twice, we should collateralize
    // the `amount` plus the `profile.target`

    await node.deposit(
      {
        channelAddress: recipientChannel.channelAddress,
        assetId: recipientAssetId,
        amount: BigNumber.from(recipientAmount)
          .add(profile.target)
          .toString(),
      },
      recipientChainId,
    );
    // TODO we'll need to check for a failed deposit here too.

    // TODO what do we do here about concurrent deposits? Do we want to set a lock?
    // Ideally, we should add to the core contracts to do one of two things:
    // 1. Allow for multiple deposits to be stored by Alice onchain in the mapping.
    //  --> note that this means the dispute + utils code now needs to account for these too
    // 2. Allow for passing in the nonce to the depositA function. This way, if a deposit gets
    //    stuck, it's possible to "cancel and overwrite" it by sending another tx at the same
    //    nonce. Only one of the two txs will succeed.
  }

  // If the above is not the case, we can make the transfer!
  const transfer = await node.conditionalTransfer({
    amount: recipientAmount,
    meta,
    conditionType,
    assetId: recipientAssetId,
    channelAddress: recipientChannel.channelAddress,
    details: conditionData,
    routingId,
  }); // TODO interface
  if (transfer.isError) {
    if (!requireOnline && transfer.getError()?.message === ServerNodeError.reasons.Timeout) {
      // store transfer
      const type = "TransferCreation";
      await store.queueUpdate(type, {
        channelAddress: recipientChannel.channelAddress,
        amount: recipientAmount,
        assetId: recipientAssetId,
        routingId,
        conditionData,
      });
    }
    return Result.fail(
      new ForwardTransferError(ForwardTransferError.reasons.ErrorForwardingTransfer, {
        message: transfer.getError()?.message,
      }),
    );
  }
  // either a successful transfer or an error
  return Result.ok(transfer.getValue());
}

// export async function forwardTransferResolution(data, node, store) {
//   let { recipientChannelAddress, paymentId, resolverData } = data;

//   const senderChannelAddress = await getSenderChannelAddressFromPaymentId(paymentId, recipientChannelAddress);

//   try {
//     await node.resolveCondtion(senderChannelAddress, paymentId, resolverData);
//     // TODO attempt a reclaim in here (Ideally not in the same try block)
//     return;
//   } catch (e) {
//     // Always store and retry this later
//   }
//   const type = "TransferResolution";
//   await store.queueUpdate(type, {
//     channelAddress: senderChannelAddress,
//     paymentId,
//     resolverData,
//   });
// }

// export async function handleIsAlive(data, node, store) {
//   // This means the user is online and has checked in. Get all updates that are queued and then execute them.
//   const updates = await store.getQueuedUpdates(data.channelAdress);

//   updates.forEach(async update => {
//     if (update.type == "TransferCreation") {
//       const { channelAddress, amount, assetId, paymentId, conditionData } = update.data;
//       // TODO do we want to try catch this? What should happen if this fails?
//       await node.conditionalTransfer(channelAddress, amount, assetId, paymentId, conditionData);
//     } else if (update.type == "TransferResolution") {
//       const { channelAddress, paymentId, resolverData } = update.data;
//       // TODO same as above
//       await node.resolveCondtion(channelAddress, paymentId, resolverData);
//     }
//   });
// }
