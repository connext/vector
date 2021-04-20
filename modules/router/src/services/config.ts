import { AllowedSwap, Result } from "@connext/vector-types";
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

export const onSwapGivenIn = async (
  transferAmount: string,
  fromAssetId: string,
  fromChainId: number,
  toAssetId: string,
  toChainId: number,
  routerSignerAddress: string,
): Promise<void> => {
  // get balancer contract abi
  // get stableSwap address ( we only need to calculate stuff so it doesn't have to be on every other chain)
  // provider based on which chain we deploy stableSwap contract.

  // const StableSwap = new Contract()

  // get router balance for each chain for balances array to get the trade size.
  // we will getOnChainBalance for routerSignerAddress
  // get balance of token for fromChainId for router
  // const fromChainRouterBalance = getOnchainBalance(fromAssetId, routerSignerAddress, fromChainId);

  // const ToChainRouterBalance = getOnchainBalance(toAssetId, routerSignerAddress, toChainId);

  // Assumption we are only considering the balance on fromChain and toChain
  // const balances = [fromChainRouterBalance, ToChainRouterBalance ];

  const fromAmountBn = BigNumber.from(transferAmount);
  // Computes how many tokens can be taken out of a pool if `tokenAmountIn` are sent, given the current balances.
  // const amountOut = await stableSwap.onSwapGivenIn(fromAmountBn, balances, 0, 1);

  // After we get the amountOut here
  // we need to calculate the Price Impact: the difference between the market price and estimated price due to trade size
  // Here, Market Price could be transferAmount only as stable token & 1:1
  // PriceImpact is going to be ((marketPrice(i.e transferAmount) - amountOut) * 100)/marketPrice

  // return {priceImpact, amountOut}
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
