import { ChainProviders, HydratedProviders } from "@connext/vector-types";
import { Provider } from "@ethersproject/abstract-provider";
import { BigNumber } from "@ethersproject/bignumber";
import { JsonRpcProvider } from "@ethersproject/providers";

const classicProviders = ["https://www.ethercluster.com/etc"];
const classicChainIds = [61];
const minGasPrice = BigNumber.from(1_000);

export const getEthProvider = (providerUrl: string, chainId?: number): JsonRpcProvider =>
  new JsonRpcProvider(
    providerUrl,
    classicProviders.includes(providerUrl) || classicChainIds.includes(chainId) ? "classic" : undefined,
  );

// xDai hardcoded their gas price to 0 but it's not actually zero..
export const getGasPrice = async (provider: Provider, providedChainId?: number): Promise<BigNumber> => {
  const chainId = providedChainId || (await provider.getNetwork())?.chainId;
  const price = await provider.getGasPrice();
  return chainId === 100 && price.lt(minGasPrice) ? minGasPrice : price;
};

export const hydrateProviders = (chainProviders: ChainProviders): HydratedProviders => {
  const hydratedProviders: { [url: string]: JsonRpcProvider } = {};
  Object.entries(chainProviders).map(([chainId, url]) => {
    hydratedProviders[chainId] = new JsonRpcProvider(url as string);
  });
  return hydratedProviders;
};
