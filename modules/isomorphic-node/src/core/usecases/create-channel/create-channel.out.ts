import { Output } from "../../definitions/output";
import { Result } from "../../definitions/result";
import { WalletError } from "../../shared/wallet/errors/wallet-error";

import { CreateChannelInvalidRequest } from "./errors/invalid-request";

export type CreateChannelOutput = Result<
  {
    channelId: string;
  },
  CreateChannelInvalidRequest | WalletError
>;
