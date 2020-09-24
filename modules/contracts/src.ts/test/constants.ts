import { waffle } from "@nomiclabs/buidler";
import { constants } from "ethers";

// ethers aliases
export const addressZero = constants.AddressZero;
export const hashZero = constants.HashZero;
export const zero = constants.Zero;
export const one = constants.One;
export const two = constants.Two;

export const provider = waffle.provider;
export const alice = provider.getWallets()[0];
export const bob = provider.getWallets()[1];
export const rando = provider.getWallets()[2];
