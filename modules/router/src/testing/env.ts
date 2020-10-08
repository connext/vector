import { ChainProviders, JsonRpcProvider } from "@connext/vector-types";
import { Wallet } from "ethers";
import pino from "pino";

import { ChainJsonProviders } from "../listener";

type RouterTestEnv = {
  chainProviders: ChainProviders;
  hydratedProviders: ChainJsonProviders;
  chainAddresses: any;
  sugarDaddy: Wallet;
  logLevel?: pino.Level;
};

const chainProviders = JSON.parse(process.env.CHAIN_PROVIDERS ?? '{"1337":"http://localhost:8545"}');

const hydratedProviders: { [url: string]: JsonRpcProvider } = {};
Object.entries(chainProviders).map(([chainId, url]) => {
  hydratedProviders[chainId] = new JsonRpcProvider(url as string);
});

export const env: RouterTestEnv = {
  chainAddresses: JSON.parse(process.env.CHAIN_ADDRESSES ?? "{}"),
  chainProviders,
  hydratedProviders,
  logLevel: (process.env.LOG_LEVEL || "silent") as pino.Level,
  sugarDaddy: Wallet.fromMnemonic(
    process.env.SUGAR_DADDY || "candy maple cake sugar pudding cream honey rich smooth crumble sweet treat",
  ),
};
