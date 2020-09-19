import { VectorOnchainService } from "@connext/vector-contracts";
import { IVectorOnchainService, Result } from "@connext/vector-types";
import { mkHash } from "@connext/vector-utils";
import { BigNumber } from "ethers";
import Sinon from "sinon";

type StubType = {
  [K in keyof IVectorOnchainService]: IVectorOnchainService[K];
};

export class MockOnchainTransactionService implements IVectorOnchainService {
  public readonly stubs: StubType;

  constructor(overrides: Partial<StubType> = {}) {
    this.stubs = Sinon.createStubInstance(VectorOnchainService, {
      getChannelOnchainBalance: Result.ok<BigNumber>(BigNumber.from(10)) as any,

      getLatestDepositByAssetId: Result.ok<{ nonce: BigNumber; amount: BigNumber }>({
        nonce: BigNumber.from(7),
        amount: BigNumber.from(14),
      }) as any,

      getChannelFactoryBytecode: Result.ok<string>(mkHash("0x51523ase")) as any,

      ...overrides,
    });
  }

  getChannelOnchainBalance(
    channelAddress: string,
    chainId: number,
    assetId: string,
  ): Promise<Result<BigNumber, Error>> {
    return this.stubs["getChannelOnchainBalance"](channelAddress, chainId, assetId);
  }

  getLatestDepositByAssetId(
    channelAddress: string,
    chainId: number,
    assetId: string,
    latestDepositNonce: number,
  ): Promise<Result<{ nonce: BigNumber; amount: BigNumber }, Error>> {
    return this.stubs["getLatestDepositByAssetId"](channelAddress, chainId, assetId, latestDepositNonce);
  }

  getChannelFactoryBytecode(channelFactoryAddress: string, chainId: number): Promise<Result<string, Error>> {
    return this.stubs["getChannelFactoryBytecode"](channelFactoryAddress, chainId);
  }

  // Easy method to set stubs mid-test
  setStub(
    method: keyof IVectorOnchainService,
    ret: StubType[typeof method],
  ): void {
    this.stubs[method] = Sinon.stub().resolves(ret);
    // TODO: maybe we have to return a new instance?
  }
}
