import { fetchJson } from "@ethersproject/web";
import { ChainInfo, ERC20Abi } from "@connext/vector-types";
import { JsonRpcProvider } from "@ethersproject/providers";
import { Contract } from "@ethersproject/contracts";
import { AddressZero } from "@ethersproject/constants";
import chains from "./chains.json";

export const CHAIN_INFO_URL = "https://chainid.network/chains.json";

export const getChainInfo = async (chainId: number): Promise<ChainInfo | string> => {
  let chain: ChainInfo | undefined;
  try {
    chain = chains.find((info: ChainInfo) => info.chainId === chainId);
    if (!chain) {
      console.log("fetching ChainInfo");
      const chainInfo: ChainInfo[] = await fetchJson(CHAIN_INFO_URL);
      chain = chainInfo!.find((info) => info.chainId === chainId);
    }

    if (chain) {
      return chain;
    } else return "N/A";
  } catch (e) {
    console.log(e);
    console.warn(`Could not fetch chain info`);
    return "N/A";
  }
};

export const getAssetName = (chainId: number, assetId: string): string => {
  const chain = chains.find((info: ChainInfo) => info.chainId === chainId);
  if (chain) {
    return chain.assetId[assetId] ? chain.assetId[assetId] ?? "Token" : "Token";
  } else {
    return "Token";
  }
};

export const getAssetDecimals = async (assetId: string, ethProvider: JsonRpcProvider) => {
  let decimals: number;
  if (assetId !== AddressZero) {
    try {
      const token = new Contract(assetId, ERC20Abi, ethProvider);
      decimals = await token.decimals();
    } catch (e) {
      // Error detecting decimals, unsafely falling back to 18 decimals for chainId
      decimals = 18;
    }
  } else {
    decimals = 18;
  }
  return decimals;
};
