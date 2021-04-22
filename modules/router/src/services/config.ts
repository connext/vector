import { AllowedSwap, Result, jsonifyError, IVectorChainReader } from "@connext/vector-types";
import { JsonRpcProvider } from "@ethersproject/providers";
import { VectorChainReader, StableSwap } from "@connext/vector-contracts";
import { getAddress } from "@ethersproject/address";
import { BigNumber } from "@ethersproject/bignumber";
import { Contract } from "@ethersproject/contracts";

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
  const toAsset = getAddress(toAssetId);
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

export const getMappedAssets = (_assetId: string, _chainId: number): { assetId: string; chainId: number }[] => {
  const routerAllowedSwaps = getConfig().allowedSwaps;

  let pair: { assetId: string; chainId: number }[] = [{ assetId: _assetId, chainId: _chainId }];
  routerAllowedSwaps.map((s) => {
    if (s.fromAssetId.toLowerCase() === _assetId.toLowerCase() && s.fromChainId === _chainId) {
      pair.push({ assetId: getAddress(s.toAssetId), chainId: s.toChainId });
    } else if (s.toAssetId.toLowerCase() === _assetId.toLowerCase() && s.toChainId === _chainId) {
      pair.push({ assetId: getAddress(s.fromAssetId), chainId: s.fromChainId });
    }
  });

  const uniquePairs = Array.from(new Set(pair.map((s) => s.assetId))).map((x) => {
    return pair.find((z) => z.assetId === x)!;
  });
  return uniquePairs;
};

export const onSwapGivenIn = async (
  transferAmount: string,
  fromAssetId: string,
  fromChainId: number,
  toAssetId: string,
  toChainId: number,
  routerSignerAddress: string,
  chainReader: IVectorChainReader,
): Promise<Result<{ priceImpact: string; amountOut: string }, ConfigServiceError>> => {
  // get router balance for each chain for balances array to get the trade size.
  // we will getOnChainBalance for routerSignerAddress
  // get balance of token for fromChainId for router

  const fromMappedAssets = getMappedAssets(fromAssetId, fromChainId);
  const toMappedAssets = getMappedAssets(toAssetId, toChainId);

  const mappedAssets = fromMappedAssets.concat(toMappedAssets);

  const uniqueMappedAssets = Array.from(new Set(mappedAssets.map((s) => s.assetId))).map((x) => {
    return mappedAssets.find((z) => z.assetId === x)!;
  });

  let balances = [];
  for (var val of uniqueMappedAssets) {
    console.log(val);
    let onChainRouterBalance = await chainReader.getOnchainBalance(val.assetId, routerSignerAddress, val.chainId);
    if (onChainRouterBalance.isError) {
      return Result.fail(
        new ConfigServiceError(ConfigServiceError.reasons.CouldNotGetAssetBalance, {
          transferAmount,
          fromAssetId,
          fromChainId,
          routerSignerAddress,
        }),
      );
    }
    balances.push(onChainRouterBalance);
  }

  const transferAmountBn = BigNumber.from(transferAmount);
  const stableAmmAddress = getConfig().stableAmmAddress!;
  const stableAmmProvider: JsonRpcProvider = new JsonRpcProvider(getConfig().stableAmmProvider!);

  try {
    const stableSwap = new Contract(stableAmmAddress, StableSwap.abi, stableAmmProvider);
    // Computes how many tokens can be taken out of a pool if `tokenAmountIn` are sent, given the current balances.
    const amountOut = await stableSwap.onSwapGivenIn(transferAmountBn, balances, 0, 1);
    // After we get the amountOut here
    // we need to calculate the Price Impact: the difference between the market price and estimated price due to trade size
    // Here, Market Price could be transferAmount only as stable token & 1:1
    // PriceImpact is going to be ((marketPrice(i.e transferAmount) - amountOut) * 100)/marketPrice

    const marketPrice = transferAmountBn;
    const priceImpact = marketPrice.sub(amountOut).mul(100).div(marketPrice);

    return Result.ok({ priceImpact: priceImpact.toString(), amountOut: amountOut.toString() });
  } catch (e) {
    return Result.fail(
      new ConfigServiceError(ConfigServiceError.reasons.CouldNotGetAssetBalance, {
        error: jsonifyError(e),
        transferAmount,
        toAssetId,
        toChainId,
        routerSignerAddress,
      }),
    );
  }
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
