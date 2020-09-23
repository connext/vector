import { use } from "chai";
import promised from "chai-as-promised";
import subset from "chai-subset";
import { MockProvider, solidity } from "ethereum-waffle";

import { VectorOnchainService } from "../onchainService";

use(promised);
use(solidity);
use(subset);

export const expect = use(solidity).expect;

export const getOnchainTxService = async (provider: MockProvider): Promise<VectorOnchainService> => {
  const network = await provider.getNetwork();
  const chainProviders = { [network.chainId]: provider };
  return new VectorOnchainService(chainProviders);
};
