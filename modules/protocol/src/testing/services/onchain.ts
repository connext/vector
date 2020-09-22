import { VectorOnchainService } from "@connext/vector-contracts";
import { Balance, FullTransferState, IVectorOnchainService, Result } from "@connext/vector-types";
import { mkAddress, mkHash } from "@connext/vector-utils";
import { BigNumber } from "ethers";
import Sinon from "sinon";

export type MockOnchainStubType = {
  [K in keyof IVectorOnchainService]: IVectorOnchainService[K];
};

export class MockOnchainService implements IVectorOnchainService {
  public readonly stubs: MockOnchainStubType;

  constructor(overrides: Partial<MockOnchainStubType> = {}) {
    this.stubs = Sinon.createStubInstance(VectorOnchainService, {
      getChannelOnchainBalance: Result.ok<BigNumber>(BigNumber.from(10)) as any,

      getLatestDepositByAssetId: Result.ok<{ nonce: BigNumber; amount: BigNumber }>({
        nonce: BigNumber.from(7),
        amount: BigNumber.from(14),
      }) as any,

      getChannelFactoryBytecode: Result.ok<string>(mkHash("0x51523ase")) as any,

      create: Result.ok<boolean>(true) as any,

      resolve: Result.ok<Balance>({ to: [mkAddress("0xaaa"), mkAddress("0xbbb")], amount: ["1", "1"] }) as any,

      ...overrides,
    });
  }
  create(transfer: FullTransferState<any>, chainId: number, bytecode?: string): Promise<Result<boolean, Error>> {
    throw new Error("Method not implemented.");
  }
  resolve(transfer: FullTransferState<any>, chainId: number, bytecode?: string): Promise<Result<Balance, Error>> {
    throw new Error("Method not implemented.");
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
  setStub(method: keyof IVectorOnchainService, ret: any): void {
    this.stubs[method] = Sinon.stub().resolves(ret);
  }
}
