import { fetchJson } from "@ethersproject/web";
import { ChainInfo, ERC20Abi } from "@connext/vector-types";
import { JsonRpcProvider } from "@ethersproject/providers";
import { Contract } from "@ethersproject/contracts";
import { AddressZero } from "@ethersproject/constants";

import chains from "./chains.json";

export const CHAIN_INFO_URL = "https://chainid.network/chains.json";

export const getChainInfo = async (chainId: number): Promise<ChainInfo> => {
  let chain: ChainInfo = chains[0];
  try {
    chain = chains.find((info: ChainInfo) => info.chainId === chainId);
    if (chain.chainId === 0) {
      const chainInfo: ChainInfo[] = await fetchJson(CHAIN_INFO_URL);
      chain = chainInfo!.find((info) => info.chainId === chainId);
    }
  } catch (e) {}
  return chain;
};

export const getAssetName = (chainId: number, assetId: string): string => {
  const chain = chains.find((info: ChainInfo) => info.chainId === chainId);
  if (chain) {
    return chain.assetId[assetId] ? chain.assetId[assetId] ?? "Token" : "Token";
  } else {
    return "Token";
  }
};

export const getAssetDecimals = async (assetId: string, ethProvider: JsonRpcProvider): Promise<number> => {
  let decimals = 18;
  if (assetId !== AddressZero) {
    try {
      const token = new Contract(assetId, ERC20Abi, ethProvider);
      decimals = await token.decimals();
    } catch (e) {
      console.warn(`Error detecting decimals, unsafely falling back to 18 decimals for ${assetId}`);
    }
  }
  return decimals;
};
