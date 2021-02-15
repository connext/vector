import { Result } from "@connext/vector-types";
import { calculateExchangeAmount } from "@connext/vector-utils";
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
  const swap = config.allowedSwaps.find(
    (s) =>
      s.fromAssetId === fromAsset &&
      s.fromChainId === fromChainId &&
      s.toAssetId === toAsset &&
      s.toChainId === toChainId,
  );

  // couldnt find both ways
  if (!swap) {
    return Result.fail(
      new SwapError(SwapError.reasons.SwapNotAllowed, fromAmount, fromAssetId, fromChainId, toAssetId, toChainId),
    );
  }

  // TODO: decimals
  if (swap.hardcodedRate) {
    return Result.ok(calculateExchangeAmount(fromAmount, swap.hardcodedRate));
  }
  return Result.fail(
    new SwapError(SwapError.reasons.SwapNotHardcoded, fromAmount, fromAssetId, fromChainId, toAssetId, toChainId),
  );
};
