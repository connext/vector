import { JsonRpcProvider } from "@ethersproject/providers";

export type ChainProviders = {
  [chainId: number]: string;
};

export type HydratedProviders = {
  [chainId: number]: JsonRpcProvider;
};
