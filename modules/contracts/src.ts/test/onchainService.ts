import { MockProvider } from "ethereum-waffle";

import { VectorOnchainTransactionService } from "../onchainService";

export const getOnchainTxService = async (provider: MockProvider): Promise<VectorOnchainTransactionService> => {
  const network = await provider.getNetwork();
  const chainProviders = { [network.chainId]: provider };
  return new VectorOnchainTransactionService(chainProviders);
};
