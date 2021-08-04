import { HDNode } from "@ethersproject/hdnode";
import { Wallet } from "@ethersproject/wallet";
import { JsonRpcProvider } from "@ethersproject/providers";
import { network, ethers, waffle } from "hardhat";
import pino from "pino";

// Get defaults from env
const chainProviders = JSON.parse(process.env.CHAIN_PROVIDERS ?? "{}");
const chainId = Object.keys(chainProviders)[0];
const url = Object.values(chainProviders)[0];
const mnemonic =
  process.env.SUGAR_DADDY ?? "candy maple cake sugar pudding cream honey rich smooth crumble sweet treat";

export const defaultLogLevel = process.env.LOG_LEVEL || "info";
export const logger = pino({ level: defaultLogLevel });

export const networkName = network.name;

export const provider = url
  ? new JsonRpcProvider(url as string, parseInt(chainId))
  : (ethers.provider as JsonRpcProvider);

export const wallets = waffle.provider.getWallets();

export const chainIdReq = provider.getNetwork().then((net) => net.chainId);
export const alice = wallets[0];
export const bob = wallets[1];
export const rando = wallets[2];
