import { TUrl, TChainId, TAddress, TIntegerString, TDecimalString } from "@connext/vector-types";
import { Static, Type } from "@sinclair/typebox";
import Ajv from "ajv";
import { getAddress } from "@ethersproject/address";
import { BigNumber } from "@ethersproject/bignumber";

const ajv = new Ajv();

const RebalanceProfileSchema = Type.Object({
  chainId: TChainId,
  assetId: TAddress,
  reclaimThreshold: TIntegerString,
  target: TIntegerString,
  collateralizeThreshold: TIntegerString,
});
export type RebalanceProfile = Static<typeof RebalanceProfileSchema>;

const AllowedSwapSchema = Type.Object({
  fromChainId: TChainId,
  toChainId: TChainId,
  fromAssetId: TAddress,
  toAssetId: TAddress,
  priceType: Type.Union([Type.Literal("hardcoded")]),
  hardcodedRate: TDecimalString,
});

const VectorRouterConfigSchema = Type.Object({
  adminToken: Type.String(),
  allowedSwaps: Type.Array(AllowedSwapSchema),
  chainProviders: Type.Dict(TUrl),
  dbUrl: Type.Optional(TUrl),
  nodeUrl: TUrl,
  logLevel: Type.Optional(
    Type.Union([
      Type.Literal("fatal"),
      Type.Literal("error"),
      Type.Literal("warn"),
      Type.Literal("info"),
      Type.Literal("debug"),
      Type.Literal("trace"),
      Type.Literal("silent"),
    ]),
  ),
  messagingUrl: Type.Optional(TUrl),
  rebalanceProfiles: Type.Array(RebalanceProfileSchema),
  mnemonic: Type.Optional(Type.String()),
});

type VectorRouterConfig = Static<typeof VectorRouterConfigSchema>;
const dbUrl = process.env.VECTOR_DATABASE_URL;
let vectorConfig: VectorRouterConfig;

const mnemonicEnv = process.env.VECTOR_MNEMONIC;
try {
  vectorConfig = JSON.parse(process.env.VECTOR_CONFIG!);
} catch (e) {
  throw new Error(`VECTOR_CONFIG contains invalid JSON: ${e.message}`);
}
const mnemonic = mnemonicEnv || vectorConfig.mnemonic;

// Set defaults
vectorConfig.nodeUrl = vectorConfig.nodeUrl || "http://node:8000";
vectorConfig.messagingUrl = vectorConfig.messagingUrl || "http://messaging";

const validate = ajv.compile(VectorRouterConfigSchema);
const valid = validate(vectorConfig);

if (!valid) {
  console.error(`Invalid config: ${JSON.stringify(vectorConfig, null, 2)}`);
  throw new Error(validate.errors?.map((err) => err.message).join(","));
}

// checksum allowed swaps + rebalance profiles
vectorConfig.allowedSwaps = vectorConfig.allowedSwaps.map((s) => {
  return { ...s, fromAssetId: getAddress(s.fromAssetId), toAssetId: getAddress(s.toAssetId) };
});
vectorConfig.rebalanceProfiles = vectorConfig.rebalanceProfiles.map((profile) => {
  // sanity checks
  const target = BigNumber.from(profile.target);
  if (target.gt(profile.reclaimThreshold)) {
    throw new Error("Rebalance target must be less than reclaim threshold");
  }

  if (target.lt(profile.collateralizeThreshold) && !target.isZero()) {
    throw new Error("Rebalance target must be larger than collateralizeThreshold or 0");
  }

  // checksum
  return {
    ...profile,
    assetId: getAddress(profile.assetId),
  };
});

export const config = {
  dbUrl,
  ...vectorConfig,
  mnemonic,
} as Omit<VectorRouterConfig, "mnemonic"> & { mnemonic: string };
