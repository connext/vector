import { Result } from "@connext/vector-types";
import { calculateExchangeAmount, inverse } from "@connext/vector-utils";
import { getAddress } from "@ethersproject/address";

import { config } from "../config";
import { SwapError } from "../errors";

export const getSwappedAmount = (
  fromAmount: string,
  fromAssetId: string,
  fromChainId: number,
  toAssetId: string,
  toChainId: number,
): Result<string, SwapError> => {
  const fromAsset = getAddress(fromAssetId);
  const toAsset = getAddress(toAssetId);
  let swap = config.allowedSwaps.find(
    (s) =>
      s.fromAssetId === fromAsset &&
      s.fromChainId === fromChainId &&
      s.toAssetId === toAsset &&
      s.toChainId === toChainId,
  );

  let invert = false;
  if (!swap) {
    // search other way around swap
    swap = config.allowedSwaps.find(
      (s) =>
        s.toAssetId === fromAsset &&
        s.toChainId === fromChainId &&
        s.fromAssetId === toAsset &&
        s.fromChainId === toChainId,
    );
    invert = true;
  }

  // couldnt find both ways
  if (!swap) {
    return Result.fail(
      new SwapError(SwapError.reasons.SwapNotAllowed, fromAmount, fromAssetId, fromChainId, toAssetId, toChainId),
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
    new SwapError(SwapError.reasons.SwapNotHardcoded, fromAmount, fromAssetId, fromChainId, toAssetId, toChainId),
  );
};
