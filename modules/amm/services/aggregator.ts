import {
  IVectorChainService
} from "@connext/vector-types"


type GetLiquidityResponse = {
  liquidity: string;
  decimals: number;
}

export class Aggregator {

  constructor(
    private readonly chainService: IVectorChainService,
  ) {
    // TODO: Setup the listening hooks
    
  }

  // liquidity = (signer balance) + (channel balances) + (active transfer balance where node == responder) + (unreconciled deposits)
  async getLiquidity(
    assetId: string,
    chainId: number,
  ): Promise<GetLiquidityResponse> {
    // TODO: Return actual stored value.
    const signerBalance = await this.chainService.getOnchainBalance(assetId, signer, chainId);
    // 1. get from chain reader
    // 2. sum of amount from the balance entity where participant, asset, (need to add) and chainId are equal to what you want
    // 3. sum of transfers iff node is responder (this makes the optimistic assumption it will all resolve to the node, this is likely not a valid assumption)
    // 4. sum of onchain transactions where its a deposit thats not marked as "reconciled" (need to add this flag and a value/asset tracking in onchain transactions or something)
    // theres actually a couple annoying assumptions this calculation you would have to make

    return {
      liquidity: "-1",
      decimals: -1
    } as GetLiquidityResponse;
  }
}