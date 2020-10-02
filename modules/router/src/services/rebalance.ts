import { Result } from "@connext/vector-types";
import { constants, utils } from "ethers";

import { ForwardTransferError } from "../forwarding";

export type RebalanceProfile = {
  reclaimThreshold: string;
  target: string;
  collateralizeThreshold: string;
};

export const getRebalanceProfile = async (
  channelAddress: string,
  assetId: string,
): Promise<Result<RebalanceProfile, ForwardTransferError>> => {
  // TODO: build dynamic/stored profiles

  // hardcoded defaults
  // TODO: make configurable
  if (assetId === constants.AddressZero) {
    return Result.ok({
      reclaimThreshold: utils.parseEther("0.2").toString(),
      target: utils.parseEther("0.1").toString(),
      collateralizeThreshold: utils.parseEther("0.05").toString(),
    });
  } else {
    return Result.ok({
      reclaimThreshold: utils.parseEther("20").toString(),
      target: utils.parseEther("10").toString(),
      collateralizeThreshold: utils.parseEther("5").toString(),
    });
  }
};
