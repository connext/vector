import { Result } from "@connext/vector-types";

import { config, RebalanceProfile } from "../config";
import { ForwardTransferCreationError } from "../errors";

export const getRebalanceProfile = (
  chainId: number,
  assetId: string,
): Result<RebalanceProfile, ForwardTransferCreationError> => {
  const rebalanceProfile = config.rebalanceProfiles.find(
    (profile) => profile.assetId === assetId && profile.chainId === chainId,
  );
  if (!rebalanceProfile) {
    return Result.fail(
      new ForwardTransferCreationError(ForwardTransferCreationError.reasons.UnableToGetRebalanceProfile, "", {
        chainId,
        assetId,
      }),
    );
  }

  return Result.ok(rebalanceProfile);
};
