import { TAddress, TChainId, TIntegerString, TDecimalString } from "@connext/vector-types";
import { Static, Type } from "@sinclair/typebox";
import Ajv from "ajv";

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
  chainProviders: Type.Map(Type.String({ format: "uri" })),
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
  throw new Error(validate.errors?.map(err => err.message).join(","));
}

export const config = {
  dbUrl,
  ...vectorConfig,
} as VectorRouterConfig;
