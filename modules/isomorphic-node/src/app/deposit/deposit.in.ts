import { BigNumber } from "ethers";

import { Input } from "../core/definitions/input";

export interface DepositInput extends Input {
  channelId: string;
  amount: BigNumber;
  assetId: string;
}
