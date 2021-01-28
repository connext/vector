import { TUrl, TChainId, TAddress, TIntegerString, AllowedSwapSchema } from "@connext/vector-types";
import { Static, Type } from "@sinclair/typebox";

const RebalanceProfileSchema = Type.Object({
  chainId: TChainId,
  assetId: TAddress,
  reclaimThreshold: TIntegerString,
  target: TIntegerString,
  collateralizeThreshold: TIntegerString,
});
export type RebalanceProfile = Static<typeof RebalanceProfileSchema>;

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
let vectorConfig: VectorRouterConfig;

try {
  vectorConfig = JSON.parse(process.env.VECTOR_CONFIG!);
} catch (e) {
  throw new Error(`VECTOR_CONFIG contains invalid JSON: ${e.message}`);
}
const mnemonic = process.env.VECTOR_MNEMONIC || vectorConfig.mnemonic;

export const config = {
  ...vectorConfig,
  mnemonic,
} as Omit<VectorRouterConfig, "mnemonic"> & { mnemonic: string };
