import { waffle } from "@nomiclabs/buidler";

export const provider = waffle.provider;
export const initiator = provider.getWallets()[0];
export const counterparty = provider.getWallets()[1];
