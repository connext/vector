import { Result } from "@connext/vector-types";
import { calculateExchangeAmount, inverse } from "@connext/vector-utils";

import { config } from "../config";
import { ForwardTransferError } from "../forwarding";

export const getSwappedAmount = async (
  fromAmount: string,
  fromAssetId: string,
  fromChainId: number,
  toAssetId: string,
  toChainId: number,
): Promise<Result<string, ForwardTransferError>> => {
  let swap = config.allowedSwaps.find(
    s =>
      s.fromAssetId === fromAssetId &&
      s.fromChainId === fromChainId &&
      s.toAssetId === toAssetId &&
      s.toChainId === toChainId,
  );

  let invert = false;
  if (!swap) {
    // search other way around swap
    swap = config.allowedSwaps.find(
      s =>
        s.toAssetId === fromAssetId &&
        s.toChainId === fromChainId &&
        s.fromAssetId === toAssetId &&
        s.fromChainId === toChainId,
    );
    invert = true;
  }

  // couldnt find both ways
  if (!swap) {
    return Result.fail(
      new ForwardTransferError(ForwardTransferError.reasons.UnableToCalculateSwap, {
        fromAssetId,
        fromChainId,
        toAssetId,
        toChainId,
      }),
    );
  }

  // TODO: decimals
  if (swap.hardcodedRate) {
    if (invert) {
      return Result.ok(calculateExchangeAmount(fromAmount, inverse(swap.hardcodedRate)));
    } else {
      return Result.ok(calculateExchangeAmount(fromAmount, swap.hardcodedRate));
    }
  }
  return Result.fail(
    new ForwardTransferError(ForwardTransferError.reasons.UnableToCalculateSwap, {
      swap,
    }),
  );
};
