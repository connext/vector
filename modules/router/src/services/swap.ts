import { Result } from "@connext/vector-types";
import { calculateExchangeWad } from "@connext/vector-utils";
import { BigNumber } from "@ethersproject/bignumber";

import { SwapError } from "../errors";
import { getDecimals } from "../metrics";

import { getMatchingSwap } from "./config";

export const getSwappedAmount = async (
  fromAmount: string,
  fromAssetId: string,
  fromChainId: number,
  toAssetId: string,
  toChainId: number,
): Promise<Result<string, SwapError>> => {
  const swapRes = getMatchingSwap(fromAssetId, fromChainId, toAssetId, toChainId);
  if (swapRes.isError) {
    return Result.fail(
      new SwapError(SwapError.reasons.SwapNotAllowed, fromAmount, fromAssetId, fromChainId, toAssetId, toChainId),
    );
  }
  const swap = swapRes.getValue();

  if (swap.hardcodedRate) {
    const fromDecimals = await getDecimals(swap.fromChainId.toString(), swap.fromAssetId);
    const toDecimals = await getDecimals(swap.toChainId.toString(), swap.toAssetId);
    const exchange = calculateExchangeWad(BigNumber.from(fromAmount), fromDecimals, swap.hardcodedRate, toDecimals);
    return Result.ok(exchange.toString());
  }
  return Result.fail(
    new SwapError(SwapError.reasons.SwapNotHardcoded, fromAmount, fromAssetId, fromChainId, toAssetId, toChainId),
  );
};
