const publicKey = process.env.INDRA_NATS_JWT_SIGNER_PUBLIC_KEY;
if (!publicKey) {
  throw new Error(`INDRA_NATS_JWT_SIGNER_PUBLIC_KEY is required`);
}

const privateKey = process.env.INDRA_NATS_JWT_SIGNER_PRIVATE_KEY;
if (!publicKey) {
  throw new Error(`INDRA_NATS_JWT_SIGNER_PRIVATE_KEY is required`);
}

const natsServers = process.env.INDRA_NATS_SERVERS;
if (!natsServers) {
  throw new Error(`INDRA_NATS_SERVERS is required`);
}

const adminToken = process.env.INDRA_ADMIN_TOKEN;
if (!adminToken) {
  throw new Error(`INDRA_ADMIN_TOKEN is required`);
}

export const config = {
  messagingUrl: natsServers,
  privateKey,
  publicKey,
  adminToken,
};
