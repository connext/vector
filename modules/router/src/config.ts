import { TAddress, TChainId, TIntegerString, TDecimalString } from "@connext/vector-types";
import { Static, Type } from "@sinclair/typebox";
import Ajv from "ajv";
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
export type AllowedSwap = Static<typeof AllowedSwapSchema>;

const VectorRouterConfigSchema = Type.Object({
  adminToken: Type.String(),
  allowedSwaps: Type.Array(AllowedSwapSchema),
  chainProviders: Type.Dict(Type.String({ format: "uri" })),
  dbUrl: Type.Optional(Type.String({ format: "uri" })),
  nodeUrl: Type.String({ format: "uri" }),
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
  rebalanceProfiles: Type.Array(RebalanceProfileSchema),
});

type VectorRouterConfig = Static<typeof VectorRouterConfigSchema>;
const dbUrl = process.env.VECTOR_DATABASE_URL;
let vectorConfig: VectorRouterConfig;
try {
  vectorConfig = JSON.parse(process.env.VECTOR_CONFIG!);
} catch (e) {
  throw new Error(`VECTOR_CONFIG contains invalid JSON: ${e.message}`);
}

// Set defaults
vectorConfig.nodeUrl = vectorConfig.nodeUrl || "http://node:8000";

const validate = ajv.compile(VectorRouterConfigSchema);
const valid = validate(vectorConfig);

if (!valid) {
  console.error(`Invalid config: ${JSON.stringify(vectorConfig, null, 2)}`);
  throw new Error(validate.errors?.map((err) => err.message).join(","));
}

// Profile sanity checks
for (const profile of vectorConfig.rebalanceProfiles) {
  const target = BigNumber.from(profile.target);
  if (target.gt(profile.reclaimThreshold)) {
    throw new Error("Rebalance target must be less than reclaim threshold");
  }

  if (target.lt(profile.collateralizeThreshold) && !target.isZero()) {
    throw new Error("Rebalance target must be larger than collateralizeThreshold or 0");
  }
}

export const config = {
  dbUrl,
  ...vectorConfig,
} as VectorRouterConfig;
