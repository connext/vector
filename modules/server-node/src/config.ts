const mnemonic = process.env.INDRA_MNEMONIC;
if (!mnemonic) {
  throw new Error("INDRA_MNEMONIC is a required config item");
}

let chainProviders;
try {
  chainProviders = JSON.parse(process.env.INDRA_CHAIN_PROVIDERS!);
} catch (e) {
  throw new Error("INDRA_CHAIN_PROVIDERS is a required config item");
}
if (!chainProviders) {
  throw new Error("INDRA_CHAIN_PROVIDERS is a required config item");
}

const redisUrl = process.env.INDRA_REDIS_URL;
if (!redisUrl) {
  throw new Error("INDRA_REDIS_URL is a required config item");
}

const natsUrl = process.env.INDRA_NATS_SERVERS;
if (!natsUrl) {
  throw new Error("INDRA_NATS_SERVERS is a required config item");
}

const authUrl = process.env.INDRA_AUTH_URL;
if (!authUrl) {
  throw new Error("INDRA_AUTH_URL is a required config item");
}

export const config = {
  port: parseInt(process.env.INDRA_PORT ?? "5040"),
  mnemonic,
  chainProviders,
  redisUrl,
  natsUrl,
  authUrl,
};
