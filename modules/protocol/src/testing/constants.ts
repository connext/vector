import { JsonRpcProvider } from "@ethersproject/providers";
import { Wallet } from "@ethersproject/wallet";

import { env } from "./env";

export const CHAIN_ID = parseInt(Object.keys(env.chainProviders)[0]);
export const tokenAddress = env.chainAddresses[CHAIN_ID]?.testTokenAddress ?? "";
export const provider = new JsonRpcProvider(env.chainProviders[CHAIN_ID], CHAIN_ID);

export const sugarDaddy = Wallet.fromMnemonic(env.sugarDaddyMnemonic).connect(provider);
export const rando = Wallet.createRandom().connect(provider);

export const alice = Wallet.createRandom().connect(provider);
export const bob = Wallet.createRandom().connect(provider);
