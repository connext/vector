import { fetchJson } from "@ethersproject/web";
import { ChainInfo } from "@connext/vector-types";
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
