import {
  FullChannelState,
  IVectorChainReader,
  jsonifyError,
  Result,
  REDUCED_GAS_PRICE,
  SIMPLE_WITHDRAWAL_GAS_ESTIMATE,
} from "@connext/vector-types";
import { getBalanceForAssetId, getParticipant, getRandomBytes32, TESTNETS_WITH_FEES } from "@connext/vector-utils";
import { ChannelFactory, ChannelMastercopy, TestToken } from "@connext/vector-contracts";
import { Interface } from "@ethersproject/abi";
import { BigNumber } from "@ethersproject/bignumber";
import { AddressZero, Zero } from "@ethersproject/constants";
import { BaseLogger } from "pino";

import { FeeError } from "../errors";
import { getDecimals } from "../metrics";

import { getRebalanceProfile, getSwapFees } from "./config";
import { getSwappedAmount } from "./swap";
import { normalizeGasFees } from "./utils";

// Takes in some proposed amount in toAssetId and returns the
// fees in the toAssetId. Will *NOT* return an error if fees > amount
export const calculateFeeAmount = async (
  transferAmount: BigNumber,
  receiveExactAmount: boolean,
  fromAssetId: string,
  fromChannel: FullChannelState,
  toAssetId: string,
  toChannel: FullChannelState,
  ethReader: IVectorChainReader,
  routerPublicIdentifier: string,
  logger: BaseLogger,
): Promise<Result<{ fee: BigNumber; amount: BigNumber }, FeeError>> => {
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
    return Result.ok({ fee: Zero, amount: transferAmount });
  }

  const fromChainId = fromChannel.networkContext.chainId;
  const toChainId = toChannel.networkContext.chainId;
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
  logger.info(
    {
      method,
      methodId,
      flatFee,
      percentageFee,
      dynamicGasFee: gasSubsidyPercentage,
    },
    "Got fee rates",
  );
  if (flatFee === "0" && percentageFee === 0 && gasSubsidyPercentage === 100) {
    // No fees configured
    return Result.ok({ fee: Zero, amount: transferAmount });
  }
  const isSwap = fromChainId !== toChainId || fromAssetId !== toAssetId;

  // Properly calculate the percentage fee / amount to send based on
  // static (non-gas) fees:
  // receivedAmt = [(100 - fee) * amt] / 100
  // ie. fee = 20%, amt = 10, receivedAmt = (80 * 10) / 100 = 8
  // If we want to set received as constant, you have
  // (received * 100) / (100 - fee) = amt
  // ie. fee = 20%, receivedAmt = 8, amt = (100 * 8) / (100 - 20) = 10

  // Calculate fees only on starting amount and update
  const amtToTransfer = receiveExactAmount ? transferAmount.mul(100).div(100 - percentageFee) : transferAmount;
  const feeFromPercent = amtToTransfer.mul(percentageFee).div(100);
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
        gasSubsidyPercentage,
      },
      "Method complete, gas is subsidized",
    );

    return Result.ok({ fee: staticFees, amount: receiveExactAmount ? amtToTransfer.add(flatFee) : transferAmount });
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
  logger.debug(
    {
      reclaimGasFees: gasFees[fromChannel.channelAddress].toString(),
      collateralizeGasFees: gasFees[toChannel.channelAddress].toString(),
    },
    "Calculated gas fees",
  );

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
    logger.error(
      {
        fromAssetDecimals,
        baseAssetFromChainDecimals,
        toAssetDecimals,
        baseAssetToChainDecimals,
        error: jsonifyError(e),
      },
      "Failed getting decimals",
    );
    return Result.fail(
      new FeeError(FeeError.reasons.ExchangeRateError, {
        message: "Could not get decimals",
        fromAssetDecimals,
        baseAssetFromChainDecimals,
        toAssetDecimals,
        baseAssetToChainDecimals,
        error: jsonifyError(e),
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
      ? await normalizeGasFees(
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
      ? await normalizeGasFees(
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
        normalizedCollateralToAsset: normalizedReclaimFromAsset.isError
          ? jsonifyError(normalizedReclaimFromAsset.getError())
          : normalizedReclaimFromAsset.getValue().toString(),
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
        fromAssetId,
        fromChainId,
        toAssetId,
        toChainId,
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
      dynamicGasFees: dynamic.toString(),
      normalizedGasFees: normalizedGasFees.toString(),
      totalFees: totalFees.toString(),
      withFees: BigNumber.from(transferAmount).sub(totalFees).toString(),
    },
    "Method complete",
  );

  // returns the total fees applied to transfer
  return Result.ok({
    fee: totalFees,
    amount: receiveExactAmount ? amtToTransfer.add(flatFee).add(dynamic) : transferAmount,
  });
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
  const method = "calculateEstimatedGasFee";
  const methodId = getRandomBytes32();
  logger.debug(
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

  // Get the gas estimates
  const fromGasEstimates = await getGasEstimates(
    fromChannel,
    fromAssetId,
    amountToSend,
    routerPublicIdentifier,
    ethReader,
  );
  const toGasEstimates = await getGasEstimates(
    toChannel,
    toAssetId,
    amountToSend, // safe to not convert, amounts dont impact gas
    routerPublicIdentifier,
    ethReader,
  );
  if (fromGasEstimates.isError || toGasEstimates.isError) {
    return Result.fail(fromGasEstimates.getError() ?? toGasEstimates.getError()!);
  }

  const fromProfile = rebalanceFromProfile.getValue();
  let fromChannelFee = Zero; // start with no actions
  if (finalFromBalance.gt(fromProfile.reclaimThreshold)) {
    // There will be a post-resolution reclaim of funds
    fromChannelFee =
      fromChannelCode.getValue() === "0x"
        ? fromGasEstimates.getValue().createChannel.add(SIMPLE_WITHDRAWAL_GAS_ESTIMATE)
        : SIMPLE_WITHDRAWAL_GAS_ESTIMATE;
  } else if (finalFromBalance.lt(fromProfile.collateralizeThreshold)) {
    // There will be a post-resolution sender collateralization
    // gas estimates are participant sensitive, so this is safe to do
    fromChannelFee =
      participantFromChannel === "alice" && fromChannelCode.getValue() === "0x"
        ? fromGasEstimates.getValue().createChannelAndDepositAlice
        : fromGasEstimates.getValue().deposit;
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
  const isSwap = fromAssetId !== toAssetId || fromChannel.networkContext.chainId !== toChannel.networkContext.chainId;
  const converted = isSwap
    ? await getSwappedAmount(
        amountToSend.toString(),
        fromAssetId,
        fromChannel.networkContext.chainId,
        toAssetId,
        toChannel.networkContext.chainId,
      )
    : Result.ok(amountToSend.toString());
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
    logger.debug(
      {
        method,
        methodId,
      },
      "Method complete",
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
    logger.debug(
      {
        method,
        methodId,
      },
      "Method complete",
    );
    return Result.ok({
      [fromChannel.channelAddress]: fromChannelFee,
      [toChannel.channelAddress]: toGasEstimates.getValue().deposit,
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
  logger.debug(
    {
      method,
      methodId,
    },
    "Method complete",
  );

  return Result.ok({
    [fromChannel.channelAddress]: fromChannelFee,
    [toChannel.channelAddress]:
      toChannelCode.getValue() === "0x"
        ? toGasEstimates.getValue().createChannelAndDepositAlice
        : toGasEstimates.getValue().deposit,
  });
};

const getGasEstimates = async (
  channel: FullChannelState,
  assetId: string,
  amount: BigNumber, // use fee amount
  routerPublicIdentifier: string,
  chainService: IVectorChainReader,
): Promise<
  Result<{ deposit: BigNumber; createChannel: BigNumber; createChannelAndDepositAlice: BigNumber }, FeeError>
> => {
  const iFactory = new Interface(ChannelFactory.abi);
  const iMastercopy = new Interface(ChannelMastercopy.abi);
  const iToken = new Interface(TestToken.abi);
  const sender = routerPublicIdentifier === channel.aliceIdentifier ? channel.alice : channel.bob;
  const createAndDepositGas =
    sender === channel.alice
      ? await chainService.estimateGas(channel.networkContext.chainId, {
          to: channel.networkContext.channelFactoryAddress,
          data: iFactory.encodeFunctionData("createChannelAndDepositAlice", [
            channel.alice,
            channel.bob,
            assetId,
            amount,
          ]),
          from: sender,
          value: assetId === AddressZero ? amount : Zero,
        })
      : Result.ok(BigNumber.from(0));
  if (createAndDepositGas.isError) {
    return Result.fail(
      new FeeError(FeeError.reasons.ChainError, {
        chainServiceMethod: "estimateGas:createChannelAndDepositAlice",
        error: jsonifyError(createAndDepositGas.getError()!),
      }),
    );
  }

  const createGas = await chainService.estimateGas(channel.networkContext.chainId, {
    to: channel.networkContext.channelFactoryAddress,
    data: iFactory.encodeFunctionData("createChannel", [channel.alice, channel.bob]),
    from: sender,
  });
  if (createGas.isError) {
    return Result.fail(
      new FeeError(FeeError.reasons.ChainError, {
        chainServiceMethod: "estimateGas:createChannel",
        error: jsonifyError(createGas.getError()!),
      }),
    );
  }

  const deposit =
    sender === channel.alice
      ? await chainService.estimateGas(channel.networkContext.chainId, {
          to: channel.channelAddress,
          from: sender,
          data: iMastercopy.encodeFunctionData("depositAlice", [assetId, amount]),
          value: assetId === AddressZero ? amount : Zero,
        })
      : await chainService.estimateGas(channel.networkContext.chainId, {
          to: channel.channelAddress,
          from: sender,
          data:
            assetId === AddressZero ? "0x" : iToken.encodeFunctionData("transfer", [channel.channelAddress, amount]),
        });

  if (deposit.isError) {
    return Result.fail(
      new FeeError(FeeError.reasons.ChainError, {
        chainServiceMethod: "estimateGas:deposit",
        error: jsonifyError(deposit.getError()!),
      }),
    );
  }

  return Result.ok({
    createChannelAndDepositAlice: createAndDepositGas.getValue(),
    createChannel: createGas.getValue(),
    deposit: deposit.getValue(),
  });
};
