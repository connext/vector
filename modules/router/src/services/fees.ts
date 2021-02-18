import { FullChannelState, GAS_ESTIMATES, IVectorChainReader, jsonifyError, Result } from "@connext/vector-types";
import {
  calculateExchangeAmount,
  getBalanceForAssetId,
  getParticipant,
  getRandomBytes32,
  logAxiosError,
} from "@connext/vector-utils";
import { BigNumber } from "@ethersproject/bignumber";
import { AddressZero, Zero } from "@ethersproject/constants";
import axios from "axios";
import { BaseLogger } from "pino";

import { config } from "../config";
import { FeeError } from "../errors";
import { rebalancedTokens } from "../metrics";

export const calculateAmountWithFee = async (
  startingAmount: BigNumber,
  fromChainId: number,
  fromAssetId: string,
  toChainId: number,
  toAssetId: string,
  toChannel: FullChannelState,
  ethReader: IVectorChainReader,
  routerPublicIdentifier: string,
  logger: BaseLogger,
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
    const gasFeeRes = await calculateDynamicFee(
      newAmount,
      toChainId,
      toAssetId,
      toChannel,
      ethReader,
      routerPublicIdentifier,
      logger,
    );
    if (gasFeeRes.isError) {
      return gasFeeRes;
    }
    const gasFee = gasFeeRes.getValue();
    const normalizedFeeRes = await normalizeFee(gasFee, toAssetId, toChainId, ethReader, logger);
    if (normalizedFeeRes.isError) {
      return gasFeeRes;
    }
    const normalizedFee = normalizedFeeRes.getValue();
    newAmount = newAmount.add(normalizedFee);
  }
  return Result.ok(newAmount);
};

export const calculateDynamicFee = async (
  amountToSend: BigNumber,
  toChainId: number,
  toAssetId: string,
  toChannel: FullChannelState,
  ethReader: IVectorChainReader,
  routerPublicIdentifier: string,
  logger: BaseLogger,
): Promise<Result<BigNumber, FeeError>> => {
  const method = "calculateDynamicFee";
  const methodId = getRandomBytes32();
  logger.info(
    {
      method,
      methodId,
      amountToSend: amountToSend.toString(),
      toChainId,
      toAssetId,
      toChannel: toChannel.channelAddress,
    },
    "Method start",
  );
  let dynamicGasFee = Zero;

  // TODO: add base fee for reclaim? would need to use `fromChainId` in that case

  // check if channel needs collateral
  const participant = getParticipant(toChannel, routerPublicIdentifier);
  if (!participant) {
    return Result.fail(
      new FeeError(FeeError.reasons.ChannelError, {
        message: "Not in channel",
        publicIdentifier: routerPublicIdentifier,
        alice: toChannel.aliceIdentifier,
        bob: toChannel.bobIdentifier,
      }),
    );
  }
  const routerBalance = getBalanceForAssetId(toChannel, toAssetId, participant);
  if (BigNumber.from(routerBalance).gte(amountToSend)) {
    // channel has balance, no extra gas required
    logger.info(
      { method, methodId, routerBalance: routerBalance.toString(), amountToSend: amountToSend.toString() },
      "Channel is collateralized",
    );
    return Result.ok(dynamicGasFee);
  }

  logger.info(
    { method, methodId, routerBalance: routerBalance.toString(), amountToSend: amountToSend.toString() },
    "Channel needs collateral",
  );
  // check if channel needs to be deployed
  const codeRes = await ethReader.getCode(toChannel.channelAddress, toChainId);
  if (codeRes.isError) {
    return Result.fail(
      new FeeError(FeeError.reasons.ChainError, {
        toChainId,
        getCodeError: jsonifyError(codeRes.getError()!),
      }),
    );
  }
  const code = codeRes.getValue();
  if (code === "0x") {
    logger.info({ method, methodId, channelAddress: toChannel.channelAddress }, "Channel needs to be deployed");
    dynamicGasFee = dynamicGasFee.add(GAS_ESTIMATES.createChannelAndDepositAlice);
    return Result.ok(dynamicGasFee);
  }

  // channel is deployed, just need a normal deposit
  if (participant === "alice") {
    dynamicGasFee = dynamicGasFee.add(GAS_ESTIMATES.depositAlice);
  } else {
    dynamicGasFee = dynamicGasFee.add(GAS_ESTIMATES.depositBob);
  }

  return Result.ok(dynamicGasFee);
};

// function to calculate gas fee amount multiplied by gas price in the toAsset units
export const normalizeFee = async (
  fee: BigNumber,
  toAssetId: string,
  toChainId: number,
  ethReader: IVectorChainReader,
  logger: BaseLogger,
): Promise<Result<BigNumber, FeeError>> => {
  const method = "normalizeFee";
  const methodId = getRandomBytes32();
  logger.info({ method, methodId, fee: fee.toString(), toAssetId, toChainId }, "Method start");
  const gasPriceRes = await ethReader.getGasPrice(toChainId);
  if (gasPriceRes.isError) {
    return Result.fail(
      new FeeError(FeeError.reasons.ChainError, { getGasPriceError: jsonifyError(gasPriceRes.getError()!) }),
    );
  }

  const gasPrice = gasPriceRes.getValue();
  const feeWithGasPrice = fee.mul(gasPrice);

  if (toChainId !== 1) {
    logger.info({ method, methodId }, "Not normalizing fees for non-mainnet");
    return Result.ok(feeWithGasPrice);
  }

  if (toAssetId === AddressZero) {
    logger.info({ method, methodId }, "Eth detected, exchange rate not required");
    return Result.ok(feeWithGasPrice);
  }

  const exchangeRateRes = await getExchangeRateInEth(toAssetId, logger);
  if (exchangeRateRes.isError) {
    return Result.fail(exchangeRateRes.getError()!);
  }
  const exchangeRate = exchangeRateRes.getValue();

  // since rate is ETH : token, need to invert
  const invertedRate = 1 / exchangeRate;

  const decimals = rebalancedTokens[toChainId][toAssetId].decimals;
  if (!decimals) {
    return Result.fail(
      new FeeError(FeeError.reasons.ExchangeRateError, {
        message: "Could not get decimals",
        invertedRate,
        toAssetId,
        toChainId,
      }),
    );
  }

  // total fee in asset normalized decimals
  const feeWithGasPriceInAsset = calculateExchangeAmount(feeWithGasPrice.toString(), invertedRate.toString(), decimals);
  return Result.ok(BigNumber.from(feeWithGasPriceInAsset));
};

export const getExchangeRateInEth = async (
  tokenAddress: string,
  logger: BaseLogger,
): Promise<Result<number, FeeError>> => {
  const uri = `https://api.coingecko.com/api/v3/simple/token_price/ethereum?contract_addresses=${tokenAddress}&vs_currencies=eth`;
  logger.info({ uri }, "Getting exchange rate");
  try {
    const response = await axios.get<{ [token: string]: { eth: number } }>(uri);
    logger.info({ uri, response: response.data }, "Got exchange rate");
    if (!response.data[tokenAddress]?.eth) {
      return Result.fail(
        new FeeError(FeeError.reasons.ExchangeRateError, {
          message: "Could not find rate in response",
          response: response.data,
          tokenAddress,
        }),
      );
    }
    return Result.ok(response.data[tokenAddress].eth);
  } catch (e) {
    logAxiosError(logger, e);
    return Result.fail(
      new FeeError(FeeError.reasons.ExchangeRateError, {
        message: "Could not get exchange rate",
        tokenAddress,
      }),
    );
  }
};
