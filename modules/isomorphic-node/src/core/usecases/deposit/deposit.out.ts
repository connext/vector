import { Result } from "../../definitions/result";
import { WalletError } from "../../shared/wallet/errors/wallet-error";

import { DepositInvalidRequest } from "./errors/invalid-request";

export type DepositOutput = Result<
  {
    channelId: string;
  },
  DepositInvalidRequest | WalletError
>;
