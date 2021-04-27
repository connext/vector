import { AllowedSwap } from "@connext/vector-types";
import PriorityQueue from "p-queue";

// Helper to create a pseudo 'hash-string' for an allowed swap to make it usable as a key.
function getAllowedSwapKey(swap: AllowedSwap): string {
  return swap.fromChainId.toString()
  + swap.toChainId.toString()
  + swap.fromAssetId.toString()
  + swap.toAssetId.toString();
}

// Used to track all the rebalances we are currently executing, to avoid
// accidentally running operations on the same model (rebalance record)
// at the same time.
const rebalanceQueues: { [swap: string]: PriorityQueue } = {};

export async function queueRebalance<T = any>(
  swap: AllowedSwap,
  rebalanceFn: () => Promise<T>,
): Promise<any> {
  const swapKey = getAllowedSwapKey(swap);
  // Check to see if resources are already being used for rebalancing for this
  // particular swap.
  if (!rebalanceQueues[swapKey]) {
    _createQueueForSwap(swap);
  }
  return await rebalanceQueues[swapKey].add(async () => {
    const res = await rebalanceFn();
    return res;
  });
}

// NOTE: Exported for use in unit testing.
export function _createQueueForSwap(swap: AllowedSwap): PriorityQueue {
  const swapKey = getAllowedSwapKey(swap);
  const priorityQueue = new PriorityQueue({ concurrency: 1 })
  rebalanceQueues[swapKey] = priorityQueue;
  return priorityQueue;
}
