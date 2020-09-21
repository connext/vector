import { MockProvider } from "ethereum-waffle";

import { VectorOnchainService } from "../onchainService";


export const getOnchainTxService = async (provider: MockProvider): Promise<VectorOnchainService> => {
  const network = await provider.getNetwork();
  const chainProviders = { [network.chainId]: provider };
  return new VectorOnchainService(chainProviders);
};
