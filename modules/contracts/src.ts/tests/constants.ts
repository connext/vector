import { waffle } from "@nomiclabs/buidler";

export const provider = waffle.provider;
export const wallets = provider.getWallets();
export const alice = wallets[0];
export const bob = wallets[1];
export const rando = wallets[2];
export const addressBookPath = "/tmp/address-book.json";
