import { waffle } from "hardhat";

export const provider = waffle.provider;
export const chainIdReq = provider.getNetwork().then((net) => net.chainId);
export const wallets = provider.getWallets();
export const alice = wallets[0];
export const bob = wallets[1];
export const rando = wallets[2];
