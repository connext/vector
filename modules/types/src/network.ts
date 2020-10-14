import { providers } from "ethers";

export type ChainProviders = {
  [chainId: number]: string;
};

export type HydratedProviders = {
  [chainId: number]: providers.JsonRpcProvider;
};
