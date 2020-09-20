import { FullChannelState } from "@connext/vector-types";
import { getCreate2MultisigAddress } from "@connext/engine";
import { BigNumber } from "@connext/vector-utils";
import { Result } from "../auth/node_modules/@connext/vector-types/dist/src";

export async function forwardTransferCreation(data, node, store) {
  // TODO we need to figure out the server-node type here
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

  let {
    amount,
    assetId,
    recipientChainId,
    recipientIdentifier,
    recipientAssetId,
    requireOnline,
    senderChannelAddress,
    conditionData,
    paymentId,
  } = data;

  // TODO validate the above params

  const senderChannel: FullChannelState = await node.getStateChannel(senderChannelAddress);
  const senderChainId = senderChannel.networkContext.chainId;

  // Below, we figure out the correct params needed for the receiver's channel. This includes
  // potential swaps/crosschain stuff

  // TODO ideally these are both combined into a better type?
  if (!recipientChainId) recipientChainId = senderChainId;
  if (!recipientAssetId) {
    recipientAssetId = assetId;
  } else {
    // TODO use a provider or service pattern here so we can unit test
    amount = await getSwappedAmount(amount, assetId, senderChainId, recipientAssetId, recipientChainId);
  }

  // Next, get the recipient's channel and figure out whether it needs to be collateralized
  const recipientChannelAddress = await getCreate2MultisigAddress(node.publicIdentifier, recipientIdentifier); //TODO how can we do this?
  const recipientChannel: FullChannelState = await node.getStateChannel(recipientChannelAddress);

  // TODO use a provider or service pattern here so we can unit test
  const profile = await getRebalanceProfile(recipientChannelAddress, recipientAssetId, recipientChainId);

  // Figure out router balance
  const routerBalanceInRecipientChannel =
    node.signerAddress == recipientChannel.participants[0]
      ? recipientChannel.balances[recipientAssetId].amount[0]
      : recipientChannel.balances[recipientAssetId].amount[1];

  // If there are not enough funds, fall back to sending the entire transfer amount + required collateral amount
  if (BigNumber.from(routerBalanceInRecipientChannel).lt(amount)) {
    // This means we need to collateralize this tx in-flight. To avoid having to rebalance twice, we should collateralize
    // the `amount` plus the `profile.target`

    // First set up listener for deposit
    const depositCompleted = new Promise((res) => {
      node.on(
        //@ts-ignore
        NodeEventName.DEPOSIT_COMPLETED_EVENT,
        (data) => res(data),
        (data) => data.assetId == recipientAssetId && data.channelAdress == recipientChannelAddress,
      );
    });

    await node.deposit(
      recipientChannelAddress,
      BigNumber.from(amount).add(profile.target).toString(),
      recipientAssetId,
    );
    await depositCompleted;
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
  try {
    await node.conditionalTransfer(recipientChannelAddress, amount, recipientAssetId, paymentId, conditionData); // TODO interface
    // TODO We should also attempt a collateralization here. However, it **should not** happen inside this try block.
    return;
  } catch (e) {
    // If the transfer *specifically* fails with a timeout + `requireOnline` is false, then we should
    // cache the transfer. Else, we should hard error.
    if (!requireOnline && e.message.contains("timeout")) {
      // TODO what does the error look like?
      //@ts-ignore
      return Result.error;
      // TODO cancel the sender payment here too!! -- How can we structure the catch block correctly here?
    }
  }
  // Fall through if we can store and forward this later
  const type = "TransferCreation";
  await store.queueUpdate(type, {
    channelAddress: recipientChannelAddress,
    amount,
    assetId: recipientAssetId,
    paymentId,
    conditionData,
  });
}

export async function forwardTransferResolution(data, node, store) {
  let { recipientChannelAddress, paymentId, resolverData } = data;

  const senderChannelAddress = await getSenderChannelAddressFromPaymentId(paymentId, recipientChannelAddress);

  try {
    await node.resolveCondtion(senderChannelAddress, paymentId, resolverData);
    // TODO attempt a reclaim in here (Ideally not in the same try block)
    return;
  } catch (e) {
    // Always store and retry this later
  }
  const type = "TransferResolution";
  await store.queueUpdate(type, {
    channelAddress: senderChannelAddress,
    paymentId,
    resolverData,
  });
}

export async function handleIsAlive(data, node, store) {
    // This means the user is online and has checked in. Get all updates that are queued and then execute them.
  const updates = await store.getQueuedUpdates(data.channelAdress);

  updates.forEach(async (update) => {
    if (update.type == "TransferCreation") {
      const { channelAddress, amount, assetId, paymentId, conditionData } = update.data;
      // TODO do we want to try catch this? What should happen if this fails? 
      await node.conditionalTransfer(channelAddress, amount, assetId, paymentId, conditionData);
    } else if (update.type == "TransferResolution") {
      const { channelAddress, paymentId, resolverData } = update.data;
      // TODO same as above
      await node.resolveCondtion(channelAddress, paymentId, resolverData);
    }
  });
}
