import { IVectorOnchainTransactionService, Result } from "@connext/vector-types";
import { BigNumber } from "ethers";

export class MockOnchainTransactionService implements IVectorOnchainTransactionService {
  getChannelOnchainBalance(
    channelAddress: string,
    chainId: number,
    assetId: string,
  ): Promise<Result<BigNumber, Error>> {
    throw new Error("Method not implemented.");
  }
  getLatestDepositByAssetId(
    channelAddress: string,
    chainId: number,
    assetId: string,
    latestDepositNonce: number,
  ): Promise<Result<{ nonce: BigNumber; amount: BigNumber }, Error>> {
    throw new Error("Method not implemented.");
  }
  getChannelFactoryBytecode(channelFactoryAddress: string, chainId: number): Promise<Result<string, Error>> {
    throw new Error("Method not implemented.");
  }
}
