import { TUrl, TChainId, TAddress, TIntegerString, AllowedSwapSchema } from "@connext/vector-types";
import { Static, Type } from "@sinclair/typebox";
import Ajv from "ajv";
import { getAddress } from "@ethersproject/address";
import { BigNumber } from "@ethersproject/bignumber";
import { readFileSync } from "fs";
import { AddressZero } from "@ethersproject/constants";

const ajv = new Ajv();

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
  routerUrl: TUrl,
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
  natsUrl: Type.Optional(Type.String()),
  authUrl: Type.Optional(TUrl),
  rebalanceProfiles: Type.Array(RebalanceProfileSchema),
  mnemonic: Type.Optional(Type.String()),
  stableAmmChainId: Type.Optional(TChainId),
  stableAmmAddress: Type.Optional(TAddress),
  routerMaxSafePriceImpact: Type.Optional(TIntegerString),
  autoRebalanceInterval: Type.Optional(Type.Number({ minimum: 1_800_000 })),
  basePercentageFee: Type.Optional(Type.Number({ minimum: 0, maximum: 100 })),
  baseFlatFee: Type.Optional(TIntegerString),
  baseGasSubsidyPercentage: Type.Optional(Type.Number({ minimum: 0, maximum: 100 })),
  feeQuoteExpiry: Type.Optional(Type.Number({ minimum: 15_000 })),
});

export type VectorRouterConfig = Static<typeof VectorRouterConfigSchema>;

export const getEnvConfig = (): VectorRouterConfig => {
  let configFile: any = {};
  try {
    let json;
    if (process.env.VECTOR_CONFIG_FILE) {
      console.log("process.env.VECTOR_CONFIG_FILE: ", process.env.VECTOR_CONFIG_FILE);
      json = readFileSync(process.env.VECTOR_CONFIG_FILE, "utf-8");
    } else {
      json = readFileSync("config.json", "utf-8");
    }
    if (json) {
      configFile = JSON.parse(json);
      console.log("configFile: ", configFile);
      console.log("Found configFile");
    }
  } catch (e) {
    console.warn("No config file available...");
  }

  let configJson: Record<string, any> = {};
  if (process.env.VECTOR_CONFIG) {
    try {
      configJson = JSON.parse(process.env.VECTOR_CONFIG);
      console.log("Found process.env.VECTOR_CONFIG");
    } catch (e) {
      console.warn("No VECTOR_CONFIG exists...");
    }
  }

  const vectorConfig: VectorRouterConfig = {
    mnemonic: process.env.VECTOR_MNEMONIC || configJson.mnemonic || configFile.mnemonic,
    dbUrl: process.env.VECTOR_DATABASE_URL || configJson.dbUrl || configFile.dbUrl,
    messagingUrl: process.env.VECTOR_MESSAGING_URL || configJson.messagingUrl || configFile.messagingUrl,
    authUrl: process.env.VECTOR_AUTH_URL || configJson.authUrl || configFile.authUrl,
    natsUrl: process.env.VECTOR_NATS_URL || configJson.natsUrl || configFile.natsUrl,
    adminToken: process.env.VECTOR_ADMIN_TOKEN || configJson.adminToken || configFile.adminToken,
    baseGasSubsidyPercentage: process.env.VECTOR_BASE_GAS_SUBSIDY_PERCENTAGE
      ? process.env.VECTOR_BASE_GAS_SUBSIDY_PERCENTAGE
      : configJson.baseGasSubsidyPercentage
      ? configJson.baseGasSubsidyPercentage
      : configFile.baseGasSubsidyPercentage
      ? configFile.baseGasSubsidyPercentage
      : 100,
    chainProviders: process.env.VECTOR_CHAIN_PROVIDERS
      ? JSON.parse(process.env.VECTOR_CHAIN_PROVIDERS)
      : configJson.chainProviders
      ? configJson.chainProviders
      : configFile.chainProviders,
    allowedSwaps: process.env.VECTOR_ALLOWED_SWAPS
      ? JSON.parse(process.env.VECTOR_ALLOWED_SWAPS)
      : configJson.allowedSwaps
      ? configJson.allowedSwaps
      : configFile.allowedSwaps,
    stableAmmChainId:
      process.env.VECTOR_STABLE_AMM_CHAIN_ID || configJson.stableAmmChainId || configFile.stableAmmChainId,
    routerMaxSafePriceImpact:
      process.env.ROUTER_MAX_SAFE_PRICE_IMPACT ||
      configJson.routerMaxSafePriceImpact ||
      configFile.routerMaxSafePriceImpact,
    stableAmmAddress:
      process.env.VECTOR_STABLE_AMM_ADDRESS || configJson.stableAmmAddress || configFile.stableAmmAddress,
    nodeUrl: process.env.VECTOR_NODE_URL || configJson.nodeUrl || configFile.nodeUrl || "http://node:8000",
    routerUrl: process.env.VECTOR_ROUTER_URL || configJson.routerUrl || configFile.routerUrl || "http://router:8000",
    rebalanceProfiles:
      process.env.VECTOR_REBALANCE_PROFILES || configJson.rebalanceProfiles || configFile.rebalanceProfiles,
    autoRebalanceInterval:
      process.env.VECTOR_AUTOREBALANCE_INTERVAL || configJson.autoRebalanceInterval || configFile.autoRebalanceInterval,
    baseFlatFee: process.env.VECTOR_BASE_FLAT_FEE || configJson.baseFlatFee || configFile.baseFlatFee,
    basePercentageFee:
      process.env.VECTOR_BASE_PERCENTAGE_FEE || configJson.basePercentageFee || configFile.basePercentageFee,
    feeQuoteExpiry: process.env.VECTOR_FEE_QUOTE_EXPIRY || configJson.feeQuoteExpiry || configFile.feeQuoteExpiry,
    logLevel: process.env.VECTOR_FEE_LOG_LEVEL || configJson.logLevel || configFile.logLevel,
  };
  return vectorConfig;
};

const vectorConfig = getEnvConfig();
const mnemonic = vectorConfig.mnemonic;

// Set defaults
if (!vectorConfig.authUrl && !vectorConfig.messagingUrl && !vectorConfig.natsUrl) {
  vectorConfig.messagingUrl = "http://messaging";
}

const validate = ajv.compile(VectorRouterConfigSchema);
const valid = validate(vectorConfig);

if (!valid) {
  console.error(`Invalid config: ${JSON.stringify(vectorConfig, null, 2)}`);
  throw new Error(validate.errors?.map((err) => err.message).join(","));
}

// checksum allowed swaps + rebalance profiles
vectorConfig.allowedSwaps = vectorConfig.allowedSwaps.map((s) => {
  // sanity check:
  // dynamicGasFees can only be assessed if `toChainId` or `fromChainId`
  // is 1
  if (s.toChainId !== 1 && s.fromChainId !== 1 && typeof s.gasSubsidyPercentage !== "undefined") {
    throw new Error(`Cannot dynamically assess gas fees for non-mainnet swaps`);
  }

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

// check stableAmm params
if (!vectorConfig.chainProviders[vectorConfig.stableAmmChainId]) {
  throw new Error(`Config requires chain provider for stableAmmChainId ${vectorConfig.stableAmmChainId}`);
}

const config = vectorConfig as Omit<VectorRouterConfig, "mnemonic"> & { mnemonic: string };

export const getConfig = (): Omit<VectorRouterConfig, "mnemonic"> & { mnemonic: string } => config;
