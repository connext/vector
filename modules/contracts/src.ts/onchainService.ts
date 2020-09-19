import { ERC20Abi, IVectorOnchainService, Result } from "@connext/vector-types";
import { BigNumber, constants, Contract, providers } from "ethers";

import { VectorChannel, ChannelFactory } from "./artifacts";

export class VectorOnchainService implements IVectorOnchainService {
  constructor(private readonly chainProviders: { [chainId: string]: providers.JsonRpcProvider }) {}

  async getChannelOnchainBalance(
    channelAddress: string,
    chainId: number,
    assetId: string,
  ): Promise<Result<BigNumber, Error>> {
    const provider = this.chainProviders[chainId];
    if (!provider) {
      return Result.fail(new Error(`No provider exists for ${chainId}`));
    }
    const channelContract = new Contract(channelAddress, VectorChannel.abi, provider);
    let onchainBalance: BigNumber;
    try {
      onchainBalance = await channelContract.getBalance(assetId);
    } catch (e) {
      // Likely means channel contract was not deployed
      // TODO: check for reason?
      try {
        onchainBalance =
          assetId === constants.AddressZero
            ? await provider!.getBalance(channelAddress)
            : await new Contract(assetId, ERC20Abi, provider).balanceOf(channelAddress);
      } catch (e) {
        return Result.fail(e);
      }
    }
    return Result.ok(onchainBalance);
  }

  async getLatestDepositByAssetId(
    channelAddress: string,
    chainId: number,
    assetId: string,
    latestDepositNonce: number,
  ): Promise<Result<{ nonce: BigNumber; amount: BigNumber }, Error>> {
    const provider = this.chainProviders[chainId];
    if (!provider) {
      return Result.fail(new Error(`No provider exists for ${chainId}`));
    }

    const channelContract = new Contract(channelAddress, VectorChannel.abi, provider);
    let latestDepositA: { nonce: BigNumber; amount: BigNumber };
    try {
      latestDepositA = await channelContract.latestDepositByAssetId(assetId);
    } catch (e) {
      if (latestDepositNonce !== 0) {
        return Result.fail(e);
      }
      // TODO: check for reason?
      // Channel contract was not deployed, use 0 value
      latestDepositA = { amount: BigNumber.from(0), nonce: BigNumber.from(0) };
    }

    return Result.ok(latestDepositA);
  }

  async getChannelFactoryBytecode(channelFactoryAddress: string, chainId: number): Promise<Result<string, Error>> {
    const provider = this.chainProviders[chainId];
    if (!provider) {
      return Result.fail(new Error(`No provider exists for ${chainId}`));
    }

    const proxyFactory = new Contract(channelFactoryAddress, ChannelFactory.abi, provider);
    try {
      const proxyBytecode = await proxyFactory.proxyCreationCode();
      return Result.ok(proxyBytecode);
    } catch (e) {
      return Result.fail(e);
    }
  }
}
