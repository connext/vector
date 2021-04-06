import { deployments } from "@connext/vector-contracts";
import { TContractAddresses, TUrl, VectorNodeConfig, VectorNodeConfigSchema } from "@connext/vector-types";
import { Type } from "@sinclair/typebox";
import { readFileSync } from "fs";
import Ajv from "ajv";

import { logger } from "./index";

const ajv = new Ajv();

console.log("process.cwd(): ", process.cwd());

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

const vectorConfig: VectorNodeConfig = {
  mnemonic: process.env.VECTOR_MNEMONIC || configJson.mnemonic || configFile.mnemonic,
  dbUrl: process.env.VECTOR_DATABASE_URL || configJson.dbUrl || configFile.dbUrl,
  messagingUrl: process.env.VECTOR_MESSAGING_URL || configJson.messagingUrl || configFile.messagingUrl,
  authUrl: process.env.VECTOR_AUTH_URL || configJson.authUrl || configFile.authUrl,
  natsUrl: process.env.VECTOR_NATS_URL || configJson.natsUrl || configFile.natsUrl,
  skipCheckIn: process.env.VECTOR_SKIP_CHECK_IN
    ? Boolean(process.env.VECTOR_SKIP_CHECK_IN)
    : configJson.skipCheckIn
    ? configJson.skipCheckIn
    : configFile.skipCheckIn
    ? configFile.skipCheckIn
    : false,
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
  chainAddresses: process.env.VECTOR_CHAIN_ADDRESSES
    ? JSON.parse(process.env.VECTOR_CHAIN_ADDRESSES)
    : configJson.chainAddresses
    ? configJson.chainAddresses
    : configFile.chainAddresses,
  logLevel: process.env.VECTOR_LOG_LEVEL || configJson.logLevel || configFile.logLevel || "info",
};

if (!vectorConfig.authUrl && !vectorConfig.messagingUrl && !vectorConfig.natsUrl) {
  vectorConfig.messagingUrl = "http://messaging";
}

// Pull live network addresses out of public deployments if not provided explicitly
for (const chainId of Object.keys(vectorConfig.chainProviders)) {
  if (!vectorConfig.chainAddresses) {
    vectorConfig.chainAddresses = {} as any;
  }
  if (!vectorConfig.chainAddresses[chainId]) {
    vectorConfig.chainAddresses[chainId] = {} as any;
  }
  if (
    !vectorConfig.chainAddresses[chainId].channelFactoryAddress &&
    deployments[chainId] &&
    deployments[chainId].ChannelFactory
  ) {
    vectorConfig.chainAddresses[chainId].channelFactoryAddress = deployments[chainId].ChannelFactory.address;
  }
  if (
    !vectorConfig.chainAddresses[chainId].transferRegistryAddress &&
    deployments[chainId] &&
    deployments[chainId].TransferRegistry
  ) {
    vectorConfig.chainAddresses[chainId].transferRegistryAddress = deployments[chainId].TransferRegistry.address;
  }
}

const validate = ajv.compile(VectorNodeConfigSchema);
const valid = validate(vectorConfig);

if (!valid) {
  throw new Error(validate.errors?.map((err) => err.message).join(","));
}

export const config = vectorConfig as Omit<VectorNodeConfig, "mnemonic"> & { mnemonic: string };
