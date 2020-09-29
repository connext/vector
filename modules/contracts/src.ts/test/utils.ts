import { MockProvider } from "ethereum-waffle";
import pino, { BaseLogger } from "pino";

import { VectorOnchainService } from "../onchainService";

export const getOnchainTxService = async (
  provider: MockProvider,
  log: BaseLogger = pino(),
): Promise<VectorOnchainService> => {
  const network = await provider.getNetwork();
  const chainProviders = { [network.chainId]: provider };
  return new VectorOnchainService(chainProviders, log.child({ module: "VectorOnchainService" }));
};
