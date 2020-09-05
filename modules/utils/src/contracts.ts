import { BigNumberish, utils } from "ethers";
import { AppIdentity, CommitmentTarget } from "@connext/types";
import { LimitedCache } from "./limitedCache";

const { solidityPack, keccak256 } = utils;

const appIdentityCache = new LimitedCache(50);

export const appIdentityToHash = (appIdentity: AppIdentity): string => {
  const key = `${appIdentity.multisigAddress}${
    appIdentity.channelNonce
  }${appIdentity.participants.join("")}${appIdentity.appDefinition}${appIdentity.defaultTimeout}`;
  const cached = appIdentityCache.get<string>(key);
  if (cached) {
    return cached;
  }
  const res = keccak256(
    solidityPack(
      ["address", "uint256", "bytes32", "address", "uint256"],
      [
        appIdentity.multisigAddress,
        appIdentity.channelNonce,
        keccak256(solidityPack(["address[]"], [appIdentity.participants])),
        appIdentity.appDefinition,
        appIdentity.defaultTimeout,
      ],
    ),
  );
  appIdentityCache.set(key, res);
  return res;
};

// TS version of MChallengeRegistryCore::computeCancelDisputeHash
export const computeCancelDisputeHash = (identityHash: string, versionNumber: BigNumberish) =>
  keccak256(
    solidityPack(
      ["uint8", "bytes32", "uint256"],
      [CommitmentTarget.CANCEL_DISPUTE, identityHash, versionNumber],
    ),
  );

// TS version of MChallengeRegistryCore::appStateToHash
export const appStateToHash = (state: string) => keccak256(state);

// TS version of MChallengeRegistryCore::computeAppChallengeHash
export const computeAppChallengeHash = (
  id: string,
  appStateHash: string,
  versionNumber: BigNumberish,
  timeout: BigNumberish,
) =>
  keccak256(
    solidityPack(
      ["uint8", "bytes32", "bytes32", "uint256", "uint256"],
      [CommitmentTarget.SET_STATE, id, appStateHash, versionNumber, timeout],
    ),
  );
