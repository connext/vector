import { MockProvider } from "ethereum-waffle";
import pino, { BaseLogger } from "pino";

import { VectorChainReader } from "../onchainService";

export const getOnchainTxService = async (
  provider: MockProvider,
  log: BaseLogger = pino(),
): Promise<VectorChainReader> => {
  const network = await provider.getNetwork();
  const chainProviders = { [network.chainId]: provider };
  return new VectorChainReader(chainProviders, log.child({ module: "VectorChainReader" }));
};
