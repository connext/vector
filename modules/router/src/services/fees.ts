import { FullChannelState, INodeService, Result } from "@connext/vector-types";
import { BigNumber } from "@ethersproject/bignumber";

import { config } from "../config";
import { FeeError } from "../errors";

export const calculateAmountWithFee = async (
  startingAmount: BigNumber,
  fromChainId: number,
  fromAssetId: string,
  toChainId: number,
  toAssetId: string,
  fromChannel: FullChannelState,
  toChannel: FullChannelState,
  nodeService: INodeService,
): Promise<Result<BigNumber, FeeError>> => {
  let flatFee = config.baseFlatFee ?? "0";
  let percentageFee = config.basePercentageFee ?? 0;
  let dynamicGasFee = config.baseDynamicGasFee ?? false;
  if (fromChainId !== toChainId || fromAssetId !== toAssetId) {
    const swap = config.allowedSwaps.find(
      (s) =>
        s.fromAssetId === fromAssetId &&
        s.fromChainId === fromChainId &&
        s.toAssetId === toAssetId &&
        s.toChainId === toChainId,
    );
    if (!swap) {
      return Result.fail(
        new FeeError(FeeError.reasons.NoSwap, {
          fromAssetId,
          fromChainId,
          toAssetId,
          toChainId,
          allowedSwaps: config.allowedSwaps,
        }),
      );
    }
    flatFee = swap.flatFee ?? "0";
    percentageFee = swap.percentageFee ?? 0;
    dynamicGasFee = swap.dynamicGasFee ?? false;
  }
  let newAmount = startingAmount.add(flatFee);
  const pctFee = newAmount.mul(percentageFee).div(100);
  newAmount = newAmount.add(pctFee);
  if (dynamicGasFee) {
    const gasFeeRes = await calculateDynamicFee();
    if (gasFeeRes.isError) {
      return gasFeeRes;
    }
    const gasFee = gasFeeRes.getValue();
    newAmount = newAmount.add(gasFee);
  }
  return Result.ok(newAmount);
};

export const calculateDynamicFee = async (
  amountToSend: BigNumber,
  toChainId: number,
  toAssetId: string,
  toChannel: FullChannelState,
  nodeService: INodeService,
): Promise<Result<BigNumber, FeeError>> => {};
