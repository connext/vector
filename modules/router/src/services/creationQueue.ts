import PriorityQueue from "p-queue";

// Used to track all the transfers we are forwarding in memory
// so that when router is handling transfers they may have dropped,
// they do not double spend. I.e. sender creates transfer and goes
// offline. Router starts forwarding to receiver, and while this is
// happening sender comes back online. Without tracking the in-progress
// forwards, the transfer would be double created with the receiver via
// the handleIsAlive fn.
export const inProgressCreations: { [channelAddr: string]: string[] } = {};

// You must serialize all transfer creations per channel, otherwise you could
// get some errors. For example:
// - transfer 1 is created, and router tries to forward.
// - transfer 1 does not have enough collateral, router attempts to deposit.
// - router deposits successfully
// - transfer 2 is created, and router tries to forward.
// - transfer 2 sees it has enough collateral, and snakes it from Transfer 1.
// - transfer 1 fails after sending a single-signed update to the channel
//   (insufficient funds).
// - transfer 1 is not cancelled until the user goes off and comes back online
//   because a single-signed update has been sent, and the transfer can only be
//   cancelled using the isAlive handlers. (Not safe to cancel until consensus
//   on channel is achieved).
// NOTE: this serialization is only important for transfer creation, otherwise
// the channel-lock should be used. The only reason it is important for transfer
// creation is because it involves 2+ channel updates (i.e. collateral + create)
// instead of just 1 (resolve)
const creationQueues: { [channelAddr: string]: PriorityQueue } = {};

export async function queueTransferCreation<T = any>(
  receiverChannelAddress: string,
  creationFn: () => Promise<T>,
): Promise<any> {
  // add a queue if it does not already exist
  if (!creationQueues[receiverChannelAddress]) {
    creationQueues[receiverChannelAddress] = new PriorityQueue({ concurrency: 1 });
  }
  return creationQueues[receiverChannelAddress].add(async () => {
    const res = await creationFn();
    return res;
  });
}
