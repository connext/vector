
type GetLiquidityResponse = {
  liquidity: string;
  decimals: number;
}

export class Aggregator {
  constructor() {
    // TODO: Setup the listening hooks
  }

  getLiquidity(
    assetId: string,
    chainId: number,
  ): GetLiquidityResponse {
    // TODO: Return actual stored value.
    return {
      liquidity: "-1",
      decimals: -1
    } as GetLiquidityResponse
  }
}