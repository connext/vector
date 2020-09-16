const mnemonic = process.env.VECTOR_MNEMONIC;
if (!mnemonic) {
  throw new Error("VECTOR_MNEMONIC is a required config item");
}

let chainProviders;
try {
  chainProviders = JSON.parse(process.env.VECTOR_CHAIN_PROVIDERS!);
} catch (e) {
  throw new Error("VECTOR_CHAIN_PROVIDERS is a required config item");
}
if (!chainProviders) {
  throw new Error("VECTOR_CHAIN_PROVIDERS is a required config item");
}

const redisUrl = process.env.VECTOR_REDIS_URL;
if (!redisUrl) {
  throw new Error("VECTOR_REDIS_URL is a required config item");
}

const natsUrl = process.env.VECTOR_NATS_SERVERS;
if (!natsUrl) {
  throw new Error("VECTOR_NATS_SERVERS is a required config item");
}

const authUrl = process.env.VECTOR_AUTH_URL;
if (!authUrl) {
  throw new Error("VECTOR_AUTH_URL is a required config item");
}

let contractAddresses;
try {
  contractAddresses = JSON.parse(process.env.VECTOR_CONTRACT_ADDRESSES!);
} catch (e) {
  throw new Error("VECTOR_CONTRACT_ADDRESSES is a required config item");
}
if (!chainProviders) {
  throw new Error("VECTOR_CONTRACT_ADDRESSES is a required config item");
}

export const config = {
  authUrl,
  chainProviders,
  contractAddresses,
  mnemonic,
  natsUrl,
  port: parseInt(process.env.VECTOR_PORT ?? "5040"),
  redisUrl,
};
