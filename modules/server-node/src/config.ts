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

export const config = {
  port: process.env.VECTOR_PORT ?? 5040,
  mnemonic,
  chainProviders,
};
