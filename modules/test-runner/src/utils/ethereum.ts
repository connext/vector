import { ERC20Abi } from "@connext/vector-types";
import { BigNumber, constants, Contract, providers, Wallet } from "ethers";

export const MAX_PATH_INDEX = 2147483647;

export const getRandomIndex = (): number => Math.floor(Math.random() * MAX_PATH_INDEX);

export const getOnchainBalance = async (
  assetId: string,
  address: string,
  provider: providers.Provider,
): Promise<BigNumber> => {
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
  const balance = await getOnchainBalance(assetId, address, funder.provider);
  if (balance.gte(fundAmount)) {
    return;
  }
  const funderBal = await getOnchainBalance(assetId, funder.address, funder.provider);
  const chain = await funder.getChainId();
  if (funderBal.lt(fundAmount)) {
    throw new Error(
      `${
        funder.address
      } has insufficient funds to gift to ${address} (requested: ${fundAmount.toString()}, balance: ${funderBal.toString()}, chain: ${chain})`,
    );
  }
  const tx =
    assetId === constants.AddressZero
      ? await funder.sendTransaction({ to: address, value: fundAmount })
      : await new Contract(assetId, ERC20Abi, funder).transfer(address, fundAmount);
  await tx.wait(2);
};
