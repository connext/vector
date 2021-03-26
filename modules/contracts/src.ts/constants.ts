import { HDNode } from "@ethersproject/hdnode";
import { Wallet } from "@ethersproject/wallet";
import { JsonRpcProvider } from "@ethersproject/providers";
import { ChainProvider } from "@connext/vector-types";
import { network, ethers } from "hardhat";
import pino from "pino";

// Get defaults from env
const chainProviders = JSON.parse(process.env.CHAIN_PROVIDERS ?? "{}");

const chainId = Object.keys(chainProviders)[0];
const urls = Object.values(chainProviders)[0];
const mnemonic = process.env.SUGAR_DADDY ?? "candy maple cake sugar pudding cream honey rich smooth crumble sweet treat";

export const defaultLogLevel = process.env.LOG_LEVEL || "info";
export const logger = pino({ level: defaultLogLevel });

export const networkName = network.name;

export const provider = urls
  ? new ChainProvider(parseInt(chainId), (urls as string).split(","))
  : new ChainProvider(parseInt(chainId), [ethers.provider as JsonRpcProvider]);

const hdNode = HDNode.fromMnemonic(mnemonic).derivePath("m/44'/60'/0'/0");

export const wallets: Wallet[] = Array(20)
  .fill(0)
  .map((_, idx) => {
    const wallet = new Wallet(hdNode.derivePath(idx.toString()).privateKey, provider);
    return wallet;
  });

export const chainIdReq = provider.getNetwork().then(net => net.chainId);
export const alice = wallets[0];
export const bob = wallets[1];
export const rando = wallets[2];
