import { AllowedSwap, Result } from "@connext/vector-types";
import { getAddress } from "@ethersproject/address";

import { getConfig, RebalanceProfile } from "../config";
import { ConfigServiceError } from "../errors";

export const getRebalanceProfile = (chainId: number, assetId: string): Result<RebalanceProfile, ConfigServiceError> => {
  const asset = getAddress(assetId);
  const rebalanceProfile = getConfig().rebalanceProfiles.find(
    (profile) => profile.assetId === asset && profile.chainId === chainId,
  );
  if (!rebalanceProfile) {
    return Result.fail(
      new ConfigServiceError(ConfigServiceError.reasons.UnableToGetRebalanceProfile, { chainId, assetId }),
    );
  }

  return Result.ok(rebalanceProfile);
};

export const getMatchingSwap = (
  fromAssetId: string,
  fromChainId: number,
  toAssetId: string,
  toChainId: number,
): Result<AllowedSwap, ConfigServiceError> => {
  const fromAsset = getAddress(fromAssetId);
  console.log("fromAsset: ", fromAsset);
  const toAsset = getAddress(toAssetId);
  console.log("toAsset: ", toAsset);
  console.log("getConfig().allowedSwaps: ", getConfig().allowedSwaps);
  const swap = getConfig().allowedSwaps.find(
    (s) =>
      s.fromAssetId === fromAsset &&
      s.fromChainId === fromChainId &&
      s.toAssetId === toAsset &&
      s.toChainId === toChainId,
  );

  if (!swap) {
    return Result.fail(
      new ConfigServiceError(ConfigServiceError.reasons.UnableToFindSwap, {
        fromAssetId,
        fromChainId,
        toAssetId,
        toChainId,
      }),
    );
  }
  return Result.ok(swap);
};

export const getSwapFees = (
  fromAssetId: string,
  fromChainId: number,
  toAssetId: string,
  toChainId: number,
): Result<
  {
    flatFee: string;
    percentageFee: number;
    gasSubsidyPercentage: number;
  },
  ConfigServiceError
> => {
  // Get fee values from config
  let flatFee = getConfig().baseFlatFee ?? "0";
  let percentageFee = getConfig().basePercentageFee ?? 0;
  let gasSubsidyPercentage = getConfig().baseGasSubsidyPercentage ?? 100;
  if (fromChainId !== toChainId || fromAssetId !== toAssetId) {
    const swapRes = getMatchingSwap(fromAssetId, fromChainId, toAssetId, toChainId);
    if (swapRes.isError && swapRes.getError()?.message !== ConfigServiceError.reasons.UnableToFindSwap) {
      return Result.fail(swapRes.getError()!);
    }
    const swap = swapRes.isError ? undefined : swapRes.getValue();
    flatFee = swap?.flatFee ?? flatFee;
    percentageFee = swap?.percentageFee ?? percentageFee;
    gasSubsidyPercentage = swap?.gasSubsidyPercentage ?? gasSubsidyPercentage;
  }
  return Result.ok({
    flatFee,
    percentageFee,
    gasSubsidyPercentage,
  });
};

export const shouldChargeFees = (
  fromAssetId: string,
  fromChainId: number,
  toAssetId: string,
  toChainId: number,
): Result<boolean, ConfigServiceError> => {
  const fees = getSwapFees(fromAssetId, fromChainId, toAssetId, toChainId);
  if (fees.isError) {
    return Result.fail(fees.getError()!);
  }
  const { flatFee, percentageFee, gasSubsidyPercentage } = fees.getValue();
  return Result.ok(flatFee !== "0" || percentageFee !== 0 || gasSubsidyPercentage !== 100);
};
