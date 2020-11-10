import { ERC20Abi } from "@connext/vector-types";
import { BigNumber, constants, Contract, providers, Wallet } from "ethers";

import { env } from "./env";

export const MAX_PATH_INDEX = 2147483647;

export const getRandomIndex = (): number => Math.floor(Math.random() * MAX_PATH_INDEX);

export const getOnchainBalance = async (assetId: string, address: string): Promise<BigNumber> => {
  const chainId = parseInt(Object.keys(env.chainProviders)[0]);
  const provider = new providers.JsonRpcProvider(env.chainProviders[chainId]);
  return assetId === constants.AddressZero
    ? provider.getBalance(address)
    : new Contract(assetId, ERC20Abi, provider).balanceOf(address);
};

export const fundIfBelow = async (
  address: string,
  assetId: string,
  fundAmount: BigNumber,
  funder: Wallet,
): Promise<void> => {
  const balance = await getOnchainBalance(assetId, address);
  if (balance.gte(fundAmount)) {
    console.log("sufficient balance, no need to fund");
    return;
  }
  const funderBal = await getOnchainBalance(assetId, funder.address);
  if (funderBal.lt(fundAmount)) {
    throw new Error(
      `${
        funder.address
      } has insufficient funds to gift to ${address} (requested: ${fundAmount.toString()}, balance: ${funderBal.toString()})`,
    );
  }
  const tx =
    assetId === constants.AddressZero
      ? await funder.sendTransaction({ to: address, value: fundAmount })
      : await new Contract(assetId, ERC20Abi, funder).transfer(address, fundAmount);
  await tx.wait();
};
