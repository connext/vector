import { Result } from "@connext/vector-types";

import { config, RebalanceProfile } from "../config";
import { ConfigServiceError } from "../errors";

export const getRebalanceProfile = (chainId: number, assetId: string): Result<RebalanceProfile, ConfigServiceError> => {
  const rebalanceProfile = config.rebalanceProfiles.find(
    (profile) => profile.assetId === assetId && profile.chainId === chainId,
  );
  if (!rebalanceProfile) {
    return Result.fail(
      new ConfigServiceError(ConfigServiceError.reasons.UnableToGetRebalanceProfile, chainId, assetId),
    );
  }

  return Result.ok(rebalanceProfile);
};
