import { ChainProviders, HydratedProviders } from "@connext/vector-types";
import { BigNumber, providers } from "ethers";

const classicProviders = ["https://www.ethercluster.com/etc"];
const classicChainIds = [61];
const minGasPrice = BigNumber.from(1_000);

export const getEthProvider = (providerUrl: string, chainId?: number): providers.JsonRpcProvider =>
  new providers.JsonRpcProvider(
    providerUrl,
    classicProviders.includes(providerUrl) || classicChainIds.includes(chainId) ? "classic" : undefined,
  );

// xDai hardcoded their gas price to 0 but it's not actually zero..
export const getGasPrice = async (provider: providers.Provider, providedChainId?: number): Promise<BigNumber> => {
  const chainId = providedChainId || (await provider.getNetwork())?.chainId;
  const price = await provider.getGasPrice();
  return chainId === 100 && price.lt(minGasPrice) ? minGasPrice : price;
};

export const hydrateProviders = (chainProviders: ChainProviders): HydratedProviders => {
  const hydratedProviders: { [url: string]: providers.JsonRpcProvider } = {};
  Object.entries(chainProviders).map(([chainId, url]) => {
    hydratedProviders[chainId] = new providers.JsonRpcProvider(url as string);
  });
  return hydratedProviders;
};
