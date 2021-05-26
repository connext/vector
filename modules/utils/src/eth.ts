import { ChainRpcProviders, HydratedProviders } from "@connext/vector-types";
import { Provider } from "@ethersproject/abstract-provider";
import { BigNumber } from "@ethersproject/bignumber";
import { JsonRpcProvider } from "@ethersproject/providers";
import { ChainRpcProvider } from "@connext/vector-types";

const classicProviders = ["https://www.ethercluster.com/etc"];
const classicChainIds = [61];
const minGasPrice = BigNumber.from(1_000);

export const getEthProvider = (providerUrl: string, chainId?: number): ChainRpcProvider =>
  new ChainRpcProvider(
    chainId,
    [
      new JsonRpcProvider(
        providerUrl,
        classicProviders.includes(providerUrl) || classicChainIds.includes(chainId) ? "classic" : undefined,
      )
    ]
  );

// xDai hardcoded their gas price to 0 but it's not actually zero..
export const getGasPrice = async (provider: Provider, providedChainId?: number): Promise<BigNumber> => {
  const chainId = providedChainId || (await provider.getNetwork())?.chainId;
  const price = await provider.getGasPrice();
  return chainId === 100 && price.lt(minGasPrice) ? minGasPrice : price;
};

/// Parse CSV formatted provider dict into ChainRpcProviders, which uses a list of Urls per chainId.
export const parseProviders = (prevChainRpcProviders: { [chainId: string]: string }): ChainRpcProviders => {
  var chainProviders: ChainRpcProviders = {}
  Object.entries(prevChainRpcProviders).forEach(
    ([chainId, urlString]) => {
      chainProviders[chainId] = urlString.split(",");
    }
  );
  return chainProviders
}

export const hydrateProviders = (chainProviders: ChainRpcProviders): HydratedProviders => {
  const hydratedProviders: { [url: string]: ChainRpcProvider } = {};
  Object.entries(chainProviders).map(([chainId, url]) => {
    hydratedProviders[chainId] = new ChainRpcProvider(parseInt(chainId), url);
  });
  return hydratedProviders;
};
