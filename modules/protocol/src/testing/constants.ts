import { providers, Wallet } from "ethers";

import { env } from "./env";

export const chainId = parseInt(Object.keys(env.chainProviders)[0]);
export const tokenAddress = env.chainAddresses[chainId].testTokenAddress;
export const provider = new providers.JsonRpcProvider(env.chainProviders[chainId], chainId);

export const sugarDaddy = Wallet.fromMnemonic(env.sugarDaddyMnemonic).connect(provider);
export const rando = Wallet.createRandom().connect(provider);

export const alice = Wallet.createRandom().connect(provider);
export const bob = Wallet.createRandom().connect(provider);
