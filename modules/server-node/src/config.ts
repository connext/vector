// TODO: fancy schema typebox runtime checks?
for (const requiredEnv of [
  "MNEMONIC",
  "DATABASE_URL",
  "CONFIG",
]) {
  if (!process.env[requiredEnv]) {
    throw new Error(`VECTOR_${requiredEnv} is a required env var`);
  }
}

const mnemonic = process.env.VECTOR_MNEMONIC;
const dbUrl = process.env.VECTOR_DATABASE_URL;
let vectorConfig;
try {
  vectorConfig = JSON.parse(process.env.VECTOR_CONFIG);
} catch (e) {
  throw new Error(`VECTOR_CONFIG contains invalid JSON: ${e.message}`);
}

// TODO: fancy schema typebox runtime checks?
for (const requiredConfig of [
  "adminToken",
  "authUrl",
  "chainAddresses",
  "chainProviders",
  "databaseUrl",
  "natsUrl",
  "redisUrl",
]) {
  if (!vectorConfig[requiredConfig]) {
    throw new Error(`VECTOR_CONFIG.${requiredConfig} is a required config item`);
  }
}

export const config = {
  ...vectorConfig,
  mnemonic,
  dbUrl,
};
