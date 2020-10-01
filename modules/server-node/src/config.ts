import { ChainProviders, ChainAddresses } from "@connext/vector-types";

type VectorNodeConfig = {
  adminToken: string;
  allowedSwaps: string[2][]; // [[fromAddress, toAddress], ...]
  allowedTokens: string[];
  authUrl: string;
  chainAddresses: ChainAddresses;
  chainProviders: ChainProviders;
  dbUrl: string;
  logLevel: string;
  mnemonic: string;
  natsUrl: string;
  port: number;
  redisUrl: string;
}

// TODO: fancy schema typebox runtime checks?
for (const requiredEnv of [
  "MNEMONIC",
  "DATABASE_URL",
  "CONFIG",
]) {
  const key = `VECTOR_${requiredEnv}`;
  if (!process.env[key]) {
    throw new Error(`${key} is a required env var`);
  }
}

const mnemonic = process.env.VECTOR_MNEMONIC;
const dbUrl = process.env.VECTOR_DATABASE_URL;
let vectorConfig;
try {
  vectorConfig = JSON.parse(process.env.VECTOR_CONFIG!);
} catch (e) {
  throw new Error(`VECTOR_CONFIG contains invalid JSON: ${e.message}`);
}

// TODO: fancy schema typebox runtime checks?
for (const requiredConfig of [
  "adminToken",
  "authUrl",
  "chainAddresses",
  "chainProviders",
  "natsUrl",
  "redisUrl",
]) {
  if (!vectorConfig[requiredConfig]) {
    throw new Error(`VECTOR_CONFIG.${requiredConfig} is a required config item`);
  }
}

export const config = {
  mnemonic,
  dbUrl,
  ...vectorConfig,
} as VectorNodeConfig;
