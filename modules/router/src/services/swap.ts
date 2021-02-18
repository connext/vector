import { Result } from "@connext/vector-types";
import { calculateExchangeWad } from "@connext/vector-utils";
import { getAddress } from "@ethersproject/address";
import { BigNumber } from "@ethersproject/bignumber";

import { config } from "../config";
import { SwapError } from "../errors";
import { getDecimals } from "../metrics";

export const getSwappedAmount = async (
  fromAmount: string,
  fromAssetId: string,
  fromChainId: number,
  toAssetId: string,
  toChainId: number,
): Promise<Result<string, SwapError>> => {
  const fromAsset = getAddress(fromAssetId);
  const toAsset = getAddress(toAssetId);
  const swap = config.allowedSwaps.find(
    (s) =>
      s.fromAssetId === fromAsset &&
      s.fromChainId === fromChainId &&
      s.toAssetId === toAsset &&
      s.toChainId === toChainId,
  );

  if (!swap) {
    return Result.fail(
      new SwapError(SwapError.reasons.SwapNotAllowed, fromAmount, fromAssetId, fromChainId, toAssetId, toChainId),
    );
  }

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
