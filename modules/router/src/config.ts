import { ChainAddresses } from "@connext/vector-types";

let chainProviders;
try {
  chainProviders = JSON.parse(process.env.VECTOR_CHAIN_PROVIDERS!);
} catch (e) {
  throw new Error("VECTOR_CHAIN_PROVIDERS is a required config item");
}
if (!chainProviders) {
  throw new Error("VECTOR_CHAIN_PROVIDERS is a required config item");
}
const adminToken = process.env.VECTOR_ADMIN_TOKEN;
if (!adminToken) {
  throw new Error("VECTOR_ADMIN_TOKEN is a required config item");
}

const dbUrl = process.env.VECTOR_DATABASE_URL;
if (!dbUrl) {
  throw new Error("VECTOR_DATABASE_URL is a required config item");
}

const serverNodeUrl = process.env.VECTOR_NODE_URL;
if (!serverNodeUrl) {
  throw new Error("VECTOR_NODE_URL is a required config item");
}

export const config = {
  chainProviders,
  port: parseInt(process.env.VECTOR_PORT ?? "5040"),
  dbUrl,
  adminToken,
  serverNodeUrl,
};
