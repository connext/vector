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
const inProgressRebalances: { [swap: string]: boolean } = {};

// 
const rebalanceQueues: { [swap: string]: PriorityQueue } = {};

export async function queueRebalance<T = any>(
  swap: AllowedSwap,
  rebalanceFn: () => Promise<T>,
): Promise<any> {
  const swapHash = getAllowedSwapKey(swap);
  // Check to see if resources are already being used for rebalancing for this
  // particular swap.
  if (!rebalanceQueues[swapHash]) {
    rebalanceQueues[swapHash] = new PriorityQueue({ concurrency: 1 });
  }
  return rebalanceQueues[swapHash].add(async () => {
    const res = await rebalanceFn();
    return res;
  });
}
