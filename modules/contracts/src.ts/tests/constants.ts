import { HDNode } from "@ethersproject/hdnode";
import { Wallet } from "@ethersproject/wallet";
import { JsonRpcProvider } from "@ethersproject/providers";
import { network, ethers }from "hardhat";

// Get defaults from env
const chainProviders = JSON.parse(process.env.CHAIN_PROVIDERS ?? "{}");
const chainId = Object.keys(chainProviders)[0];
const url = Object.values(chainProviders)[0];
const mnemonic = process.env.SUGAR_DADDY!;

export const networkName = network.name;

export const provider = url
  ? new JsonRpcProvider(url as string, parseInt(chainId))
  : ethers.provider;

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
