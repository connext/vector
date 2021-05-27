import { ChainProviders, HydratedProviders, ChainRpcProvider } from "@connext/vector-types";
import { Provider } from "@ethersproject/abstract-provider";
import { BigNumber } from "@ethersproject/bignumber";
import { JsonRpcProvider } from "@ethersproject/providers";

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
export const parseProviders = (
  prevChainRpcProviders: ChainProviders |
  { [chainId: string]: string; } |
  { [chainId: string]: string[]; }
): ChainProviders => {
  let chainProviders: ChainProviders = {}
  Object.entries(prevChainRpcProviders).forEach(
    ([chainId, urls]) => {
      // TODO: Wrap parseInt operation with descriptive error.
      let key: number;
      try {
        key = parseInt(chainId);
      } catch (e) {
        throw new Error(
          `Failed to parse integer chain ID. Please ensure config chain IDs are numeric. Error: ${e}`
        );
      }
      // Check if providers are still in string format and need to be parsed out.
      chainProviders[key] = typeof(urls) === "string" ? urls.split(",") : urls;
    }
  );
  return chainProviders
}

export const hydrateProviders = (
  chainProviders: ChainProviders |
  { [chainId: string]: string; } |
  { [chainId: string]: string[]; }
): HydratedProviders => {
  chainProviders = parseProviders(chainProviders);
  const hydratedProviders: { [url: string]: ChainRpcProvider } = {};
  Object.entries(chainProviders).map(([chainId, url]) => {
    hydratedProviders[chainId] = new ChainRpcProvider(parseInt(chainId), url);
  });
  return hydratedProviders;
};
