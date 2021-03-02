import { IVectorChainReader, Result, jsonifyError, VectorError, Values } from "@connext/vector-types";
import { BigNumber } from "@ethersproject/bignumber";
import { AddressZero } from "@ethersproject/constants";
import axios from "axios";
import { BaseLogger } from "pino";

import { logAxiosError } from "./error";
import { getRandomBytes32 } from "./hexStrings";
import { inverse, calculateExchangeWad } from "./math";

export class FeeCalculationError extends VectorError {
  static readonly type = "FeeCalculationError";

  static readonly reasons = {
    ChainError: "Error reading the chain",
    ExchangeRateError: "Error getting exchange rate",
  } as const;

  constructor(public readonly message: Values<typeof FeeCalculationError.reasons>, context: any = {}) {
    super(message, context, FeeCalculationError.type);
  }
}

// Some testnets will have hardcoded fees for easier testing
// [rinkeby, goerli, kovan, mumbai, local, local]
export const TESTNETS_WITH_FEES = [4, 5, 42, 80001, 1337, 1338];

// function to calculate gas fee amount multiplied by gas price in the
// toAsset units. some caveats:
// - there is no l2 exchange rate feed, so it is not possible to get the
//   rates from l2BaseAsset --> toAsset
// - there is no great way to determine *which* asset is the l2BaseAsset
//
// because of the above reasons, if the `toChainId` is *not* mainnet, then
// the function returns an error. this is enforced in router config validation
// as well
export const normalizeFee = async (
  fee: BigNumber,
  baseAssetDecimals: number,
  desiredFeeAssetId: string, // asset you want fee denominated in
  desiredFeeAssetDecimals: number,
  chainId: number,
  ethReader: IVectorChainReader,
  logger: BaseLogger,
  gasPriceOverride?: BigNumber,
): Promise<Result<BigNumber, FeeCalculationError>> => {
  const method = "normalizeFee";
  const methodId = getRandomBytes32();
  logger.info(
    { method, methodId, fee: fee.toString(), toAssetId: desiredFeeAssetId, toChainId: chainId },
    "Method start",
  );
  if (chainId !== 1 && !TESTNETS_WITH_FEES.includes(chainId)) {
    return Result.fail(
      new FeeCalculationError(FeeCalculationError.reasons.ChainError, {
        message: "Cannot get normalize fees that are not going to mainnet",
        toAssetId: desiredFeeAssetId,
        toChainId: chainId,
        fee: fee.toString(),
      }),
    );
  }

  let gasPrice = gasPriceOverride;
  if (!gasPriceOverride) {
    const gasPriceRes = await ethReader.getGasPrice(chainId);
    if (gasPriceRes.isError) {
      return Result.fail(
        new FeeCalculationError(FeeCalculationError.reasons.ChainError, {
          getGasPriceError: jsonifyError(gasPriceRes.getError()!),
        }),
      );
    }
    gasPrice = gasPriceRes.getValue();
  }
  const feeWithGasPrice = fee.mul(gasPrice);

  if (desiredFeeAssetId === AddressZero) {
    logger.info({ method, methodId }, "Eth detected, exchange rate not required");
    return Result.ok(feeWithGasPrice);
  }

  // use hardcoded rate of 100 tokens : 1 ETH if testnet
  const exchangeRateRes = TESTNETS_WITH_FEES.includes(chainId)
    ? Result.ok(0.01)
    : await getExchangeRateInEth(desiredFeeAssetId, logger);
  if (exchangeRateRes.isError) {
    return Result.fail(exchangeRateRes.getError()!);
  }
  const exchangeRate = exchangeRateRes.getValue();

  // since rate is ETH : token, need to invert
  const invertedRate = inverse(exchangeRate.toString());

  // total fee in asset normalized decimals
  const feeWithGasPriceInAsset = calculateExchangeWad(
    feeWithGasPrice,
    baseAssetDecimals,
    invertedRate,
    desiredFeeAssetDecimals,
  );
  return Result.ok(BigNumber.from(feeWithGasPriceInAsset));
};

export const getExchangeRateInEth = async (
  tokenAddress: string,
  logger: BaseLogger,
): Promise<Result<number, FeeCalculationError>> => {
  const uri = `https://api.coingecko.com/api/v3/simple/token_price/ethereum?contract_addresses=${tokenAddress}&vs_currencies=eth`;
  logger.info({ uri }, "Getting exchange rate");
  try {
    const response = await axios.get<{ [token: string]: { eth: number } }>(uri);
    logger.info({ uri, response: response.data }, "Got exchange rate");
    if (!response.data[tokenAddress]?.eth && !response.data[tokenAddress.toLowerCase()]?.eth) {
      return Result.fail(
        new FeeCalculationError(FeeCalculationError.reasons.ExchangeRateError, {
          message: "Could not find rate in response",
          response: response.data,
          tokenAddress,
        }),
      );
    }
    return Result.ok(response.data[tokenAddress]?.eth! ?? response.data[tokenAddress.toLowerCase()]?.eth!);
  } catch (e) {
    logAxiosError(logger, e);
    return Result.fail(
      new FeeCalculationError(FeeCalculationError.reasons.ExchangeRateError, {
        message: "Could not get exchange rate",
        tokenAddress,
        error: e.message,
      }),
    );
  }
};
