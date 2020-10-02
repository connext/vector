import { Result } from "@connext/vector-types";

import { ForwardTransferError } from "../forwarding";

// TODO:
export const getSwappedAmount = async (
  senderAmount: string,
  senderAssetId: string,
  senderChainId: number,
  recipientAssetId: string,
  recipientChainId: number,
): Promise<Result<string, ForwardTransferError>> => {
  return Result.ok(senderAmount);
};
