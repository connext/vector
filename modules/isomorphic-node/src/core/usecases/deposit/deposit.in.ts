import { BigNumber } from "ethers";

export type DepositInput = {
  channelId: string;
  amount: BigNumber;
  assetId: string;
};
