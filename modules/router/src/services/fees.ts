import {
  FullChannelState,
  GAS_ESTIMATES,
  IVectorChainReader,
  jsonifyError,
  Result,
  REDUCED_GAS_PRICE,
} from "@connext/vector-types";
import {
  getBalanceForAssetId,
  getParticipant,
  getRandomBytes32,
  TESTNETS_WITH_FEES,
  normalizeFee,
} from "@connext/vector-utils";
import { BigNumber } from "@ethersproject/bignumber";
import { AddressZero, Zero } from "@ethersproject/constants";
import { BaseLogger } from "pino";

import { FeeError } from "../errors";
import { getDecimals } from "../metrics";

import { getRebalanceProfile, getSwapFees } from "./config";
import { getSwappedAmount } from "./swap";

// Takes in some proposed amount in toAssetId and returns the
// fees in the toAssetId. Will *NOT* return an error if fees > amount
export const calculateFeeAmount = async (
  transferAmount: BigNumber,
  fromAssetId: string,
  fromChannel: FullChannelState,
  toAssetId: string,
  toChannel: FullChannelState,
  ethReader: IVectorChainReader,
  routerPublicIdentifier: string,
  logger: BaseLogger,
): Promise<Result<BigNumber, FeeError>> => {
  const method = "calculateFeeAmount";
  const methodId = getRandomBytes32();
  logger.info(
    {
      method,
      methodId,
      startingAmount: transferAmount.toString(),
      fromAssetId,
      fromChainId: fromChannel.networkContext.chainId,
      fromChannel: fromChannel.channelAddress,
      toChainId: toChannel.networkContext.chainId,
      toAssetId,
      toChannel: toChannel.channelAddress,
    },
    "Method start",
  );
  // If recipient is router, i.e. fromChannel ===  toChannel, then the
  // fee amount is 0 because no fees are taken without forwarding
  if (toChannel.channelAddress === fromChannel.channelAddress) {
    return Result.ok(BigNumber.from(0));
  }

  const toChainId = toChannel.networkContext.chainId;
  const fromChainId = fromChannel.networkContext.chainId;
  // Get fee values from config
  const fees = getSwapFees(fromAssetId, fromChainId, toAssetId, toChainId);
  if (fees.isError) {
    return Result.fail(
      new FeeError(FeeError.reasons.ConfigError, {
        getFeesError: jsonifyError(fees.getError()!),
      }),
    );
  }
  const { flatFee, percentageFee, gasSubsidyPercentage } = fees.getValue();
  const isSwap = fromChainId !== toChainId || fromAssetId !== toAssetId;
  logger.debug(
    {
      method,
      methodId,
      flatFee,
      percentageFee,
      dynamicGasFee: gasSubsidyPercentage,
    },
    "Got fee rates",
  );

  // Calculate fees only on starting amount and update
  const feeFromPercent = transferAmount.mul(percentageFee).div(100);
  const staticFees = feeFromPercent.add(flatFee);
  if (gasSubsidyPercentage === 100) {
    // gas is fully subsidized
    logger.info(
      {
        method,
        methodId,
        startingAmount: transferAmount.toString(),
        staticFees: staticFees.toString(),
        withStaticFees: staticFees.add(transferAmount).toString(),
      },
      "Method complete",
    );
    return Result.ok(staticFees);
  }

  logger.debug(
    {
      method,
      methodId,
      startingAmount: transferAmount.toString(),
      staticFees: staticFees.toString(),
    },
    "Calculating gas fee",
  );

  // Calculate gas fees for transfer
  const gasFeesRes = await calculateEstimatedGasFee(
    transferAmount, // in fromAsset
    toAssetId,
    fromAssetId,
    fromChannel,
    toChannel,
    ethReader,
    routerPublicIdentifier,
    logger,
  );
  if (gasFeesRes.isError) {
    return Result.fail(gasFeesRes.getError()!);
  }
  const gasFees = gasFeesRes.getValue();

  // Get decimals for base asset + fees
  let fromAssetDecimals: number | undefined = undefined;
  let baseAssetFromChainDecimals: number | undefined = undefined;
  let toAssetDecimals: number | undefined = undefined;
  let baseAssetToChainDecimals: number | undefined = undefined;
  try {
    fromAssetDecimals = await getDecimals(fromChannel.networkContext.chainId.toString(), fromAssetId);
    baseAssetFromChainDecimals = await getDecimals(fromChannel.networkContext.chainId.toString(), AddressZero);
    toAssetDecimals = await getDecimals(toChannel.networkContext.chainId.toString(), toAssetId);
    baseAssetToChainDecimals = await getDecimals(toChannel.networkContext.chainId.toString(), AddressZero);
  } catch (e) {
    return Result.fail(
      new FeeError(FeeError.reasons.ExchangeRateError, {
        message: "Could not get decimals",
        fromAssetDecimals,
        baseAssetFromChainDecimals,
        toAssetDecimals,
        baseAssetToChainDecimals,
      }),
    );
  }

  // After getting the gas fees for reclaim and for collateral, we
  // must convert them to the proper value in the `fromAsset` (the same asset
  // that the transfer amount is given in).
  // NOTE: only *mainnet* gas fees are assessed here. If you are reclaiming
  // on chain1, include reclaim fees. If you are collateralizing on chain1,
  // include collateral fees
  const normalizedReclaimFromAsset =
    fromChainId === 1 || TESTNETS_WITH_FEES.includes(fromChainId) // fromAsset MUST be on mainnet or hardcoded
      ? await normalizeFee(
          gasFees[fromChannel.channelAddress],
          baseAssetFromChainDecimals,
          fromAssetId,
          fromAssetDecimals,
          fromChainId,
          ethReader,
          logger,
          REDUCED_GAS_PRICE, // assume reclaim actions happen at reduced price
        )
      : Result.ok(Zero);
  const normalizedCollateralToAsset =
    toChainId === 1 || TESTNETS_WITH_FEES.includes(toChainId) // toAsset MUST be on mainnet or hardcoded
      ? await normalizeFee(
          gasFees[toChannel.channelAddress],
          baseAssetToChainDecimals,
          toAssetId,
          toAssetDecimals,
          toChainId,
          ethReader,
          logger,
        )
      : Result.ok(Zero);

  if (normalizedReclaimFromAsset.isError || normalizedCollateralToAsset.isError) {
    return Result.fail(
      new FeeError(FeeError.reasons.ExchangeRateError, {
        message: "Could not normalize fees",
        fromChainId,
        toChainId,
        toAssetId,
        normalizedCollateralToAsset: normalizedCollateralToAsset.isError
          ? jsonifyError(normalizedCollateralToAsset.getError())
          : normalizedCollateralToAsset.getValue().toString(),
        normalizedCollateral: normalizedCollateralToAsset.isError
          ? jsonifyError(normalizedCollateralToAsset.getError())
          : normalizedCollateralToAsset.getValue().toString(),
      }),
    );
  }

  // Now that you have the normalized collateral values, you must use the
  // swap config to get the normalized collater in the desired `fromAsset`.
  // We know the to/from swap is supported, and we do *not* know if they are
  // both on mainnet (i.e. we do not have an oracle)
  const normalizedCollateralFromAsset = isSwap
    ? await getSwappedAmount(
        normalizedCollateralToAsset.getValue().toString(),
        toAssetId,
        toChainId,
        fromAssetId,
        fromChainId,
      )
    : Result.ok(normalizedCollateralToAsset.getValue().toString());
  if (normalizedCollateralFromAsset.isError) {
    return Result.fail(
      new FeeError(FeeError.reasons.ConversionError, {
        toChainId,
        toAssetId,
        fromChainId,
        fromAssetId,
        conversionError: jsonifyError(normalizedCollateralFromAsset.getError()!),
        normalizedCollateralToAsset: normalizedCollateralToAsset.getValue().toString(),
      }),
    );
  }

  const normalizedGasFees = normalizedReclaimFromAsset.getValue().add(normalizedCollateralFromAsset.getValue());
  // take the subsidy percentage of the normalized fees
  const dynamic = normalizedGasFees.mul(100 - gasSubsidyPercentage).div(100);
  const totalFees = staticFees.add(dynamic);
  logger.info(
    {
      method,
      methodId,
      startingAmount: transferAmount.toString(),
      staticFees: staticFees.toString(),
      normalizedGasFees: normalizedGasFees.toString(),
      totalFees: totalFees.toString(),
      withFees: BigNumber.from(transferAmount).sub(totalFees).toString(),
    },
    "Method complete",
  );

  // returns the total fees applied to transfer
  return Result.ok(totalFees);
};

// This function returns the cost in wei units. it is in the `normalize`
// function where this is properly converted to the `toAsset` units
// NOTE: it will return an object keyed on chain id to indicate which
// chain the fees are charged on. these fees will have to be normalized
// separately, then added together.

// E.g. consider the case where transferring from mainnet --> matic
// the fees there are:
// (1) collateralizing on matic
// (2) reclaiming on mainnet
// Because we don't have l2 prices of tokens/l2 base assets, we cannot
// normalize the collateralization fees. However, we can normalize the
// reclaim fees
export const calculateEstimatedGasFee = async (
  amountToSend: BigNumber, // in fromAsset
  toAssetId: string,
  fromAssetId: string,
  fromChannel: FullChannelState,
  toChannel: FullChannelState,
  ethReader: IVectorChainReader,
  routerPublicIdentifier: string,
  logger: BaseLogger,
): Promise<Result<{ [channelAddress: string]: BigNumber }, FeeError>> => {
  const method = "calculateDynamicFee";
  const methodId = getRandomBytes32();
  logger.info(
    {
      method,
      methodId,
      amountToSend: amountToSend.toString(),
      toChannel: toChannel.channelAddress,
    },
    "Method start",
  );

  // the sender channel will have the following possible actions based on the
  // rebalance profile:
  // (1) IFF current balance + transfer amount > reclaimThreshold, reclaim
  // (2) IFF current balance + transfer amount < collateralThreshold,
  //     collateralize
  const participantFromChannel = getParticipant(fromChannel, routerPublicIdentifier);
  if (!participantFromChannel) {
    return Result.fail(
      new FeeError(FeeError.reasons.ChannelError, {
        message: "Not in channel",
        publicIdentifier: routerPublicIdentifier,
        alice: fromChannel.aliceIdentifier,
        bob: fromChannel.bobIdentifier,
        channelAddress: fromChannel.channelAddress,
      }),
    );
  }
  // Determine final balance (assuming successful transfer resolution)
  const finalFromBalance = amountToSend.add(getBalanceForAssetId(fromChannel, fromAssetId, participantFromChannel));

  // Actions in channel will depend on contract being deployed, so get that
  const fromChannelCode = await ethReader.getCode(fromChannel.channelAddress, fromChannel.networkContext.chainId);
  if (fromChannelCode.isError) {
    return Result.fail(
      new FeeError(FeeError.reasons.ChainError, {
        fromChainId: fromChannel.networkContext.chainId,
        fromChannel: fromChannel.channelAddress,
        getCodeError: jsonifyError(fromChannelCode.getError()!),
      }),
    );
  }

  // Get the rebalance profile
  const rebalanceFromProfile = getRebalanceProfile(fromChannel.networkContext.chainId, fromAssetId);
  if (rebalanceFromProfile.isError) {
    return Result.fail(
      new FeeError(FeeError.reasons.ConfigError, {
        message: "Failed to get rebalance profile",
        assetId: fromAssetId,
        chainId: fromChannel.networkContext.chainId,
        error: jsonifyError(rebalanceFromProfile.getError()!),
      }),
    );
  }

  const fromProfile = rebalanceFromProfile.getValue();
  let fromChannelFee = Zero; // start with no actions
  if (finalFromBalance.gt(fromProfile.reclaimThreshold)) {
    // There will be a post-resolution reclaim of funds
    fromChannelFee =
      fromChannelCode.getValue() === "0x"
        ? GAS_ESTIMATES.createChannel.add(GAS_ESTIMATES.withdraw)
        : GAS_ESTIMATES.withdraw;
  } else if (finalFromBalance.lt(fromProfile.collateralizeThreshold)) {
    // There will be a post-resolution sender collateralization
    fromChannelFee =
      participantFromChannel === "bob"
        ? GAS_ESTIMATES.depositBob
        : fromChannelCode.getValue() === "0x" // is alice, is deployed?
        ? GAS_ESTIMATES.createChannelAndDepositAlice
        : GAS_ESTIMATES.depositAlice;
  }

  // when forwarding a transfer, the only immediate costs on the receiver-side
  // are the ones needed to properly collateralize the transfer

  // there are several conditions that would effect the collateral costs
  // (1) channel has sufficient collateral: none
  // (2) participant == alice && contract not deployed: createChannelAndDeposit
  // (3) participant == alice && contract deployed: depositAlice
  // (4) participant == bob && contract not deployed: depositBob (channel does
  //     not need to be created for a deposit to be recognized offchain)
  // (5) participant == bob && contract deployed: depositBob

  const participantToChannel = getParticipant(toChannel, routerPublicIdentifier);
  if (!participantToChannel) {
    return Result.fail(
      new FeeError(FeeError.reasons.ChannelError, {
        message: "Not in channel",
        publicIdentifier: routerPublicIdentifier,
        alice: toChannel.aliceIdentifier,
        bob: toChannel.bobIdentifier,
        channelAddress: toChannel.channelAddress,
      }),
    );
  }
  const routerBalance = getBalanceForAssetId(toChannel, toAssetId, participantToChannel);
  // get the amount you would send
  const converted = await getSwappedAmount(
    amountToSend.toString(),
    fromAssetId,
    fromChannel.networkContext.chainId,
    toAssetId,
    toChannel.networkContext.chainId,
  );
  if (converted.isError) {
    return Result.fail(
      new FeeError(FeeError.reasons.ConversionError, {
        swapError: jsonifyError(converted.getError()!),
      }),
    );
  }
  if (BigNumber.from(routerBalance).gte(converted.getValue())) {
    // channel has balance, no extra gas required to facilitate transfer
    logger.info(
      { method, methodId, routerBalance: routerBalance.toString(), amountToSend: amountToSend.toString() },
      "Channel is collateralized",
    );
    return Result.ok({
      [fromChannel.channelAddress]: fromChannelFee,
      [toChannel.channelAddress]: Zero,
    });
  }
  logger.info(
    {
      method,
      methodId,
      routerBalance: routerBalance.toString(),
      amountToSend: amountToSend.toString(),
      participant: participantToChannel,
    },
    "Channel is undercollateralized",
  );

  // If participant is bob, then you don't need to worry about deploying
  // the channel contract
  if (participantToChannel === "bob") {
    return Result.ok({
      [fromChannel.channelAddress]: fromChannelFee,
      [toChannel.channelAddress]: GAS_ESTIMATES.depositBob,
    });
  }

  // Determine if channel needs to be deployed to properly calculate the
  // collateral fee
  const toChannelCode = await ethReader.getCode(toChannel.channelAddress, toChannel.networkContext.chainId);
  if (toChannelCode.isError) {
    return Result.fail(
      new FeeError(FeeError.reasons.ChainError, {
        toChainId: toChannel.networkContext.chainId,
        getCodeError: jsonifyError(toChannelCode.getError()!),
      }),
    );
  }
  return Result.ok({
    [fromChannel.channelAddress]: fromChannelFee,
    [toChannel.channelAddress]:
      toChannelCode.getValue() === "0x" ? GAS_ESTIMATES.createChannelAndDepositAlice : GAS_ESTIMATES.depositAlice,
  });
};
