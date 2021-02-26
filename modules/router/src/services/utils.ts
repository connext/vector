import { IVectorChainReader, Result } from "@connext/vector-types";
import { FeeCalculationError, normalizeFee } from "@connext/vector-utils";
import { BigNumber } from "@ethersproject/bignumber";
import { BaseLogger } from "pino";

// Yes, this is dumb. It helps with mocking because using
// sinon to mock vector-utils functions does not work
export function normalizeGasFees(
  fee: BigNumber,
  baseAssetDecimals: number,
  desiredFeeAssetId: string, // asset you want fee denominated in
  desiredFeeAssetDecimals: number,
  chainId: number,
  ethReader: IVectorChainReader,
  logger: BaseLogger,
  gasPriceOverride?: BigNumber,
): Promise<Result<BigNumber, FeeCalculationError>> {
  return normalizeFee(
    fee,
    baseAssetDecimals,
    desiredFeeAssetId,
    desiredFeeAssetDecimals,
    chainId,
    ethReader,
    logger,
    gasPriceOverride,
  );
}
