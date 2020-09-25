import { TestToken } from "@connext/vector-contracts";
import { Contract, utils } from "ethers";

import { provider, sugarDaddy, tokenAddress } from "../constants";

export const fundAddress = async (recipient: string): Promise<void> => {
  const value = utils.parseEther("100");

  const ethTx = await sugarDaddy.sendTransaction({
    to: recipient,
    value,
  });
  if (!ethTx.hash) throw new Error(`Couldn't fund account ${recipient}`);
  await provider.waitForTransaction(ethTx.hash);

  const tokenTx = await (
    new Contract(tokenAddress, TestToken.abi, sugarDaddy)
  ).transfer(
    recipient,
    value,
  );
  await provider.waitForTransaction(tokenTx.hash);
};
